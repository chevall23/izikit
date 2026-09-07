import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  approveListing,
  rejectListing,
  deleteListing,
  bulkModerate,
  type ModerationClient,
} from './moderation';

function makeDb(): ModerationClient & {
  listing: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
} {
  return {
    listing: {
      findUnique: vi.fn(),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'l1',
        ...args.data,
      })),
      delete: vi.fn(async () => ({ id: 'l1' })),
    },
  };
}

let db: ReturnType<typeof makeDb>;
beforeEach(() => {
  db = makeDb();
});

describe('approveListing', () => {
  it('moves PENDING -> VERIFIED and stamps the moderator', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'PENDING' });
    const out = await approveListing(db, { id: 'l1', adminId: 'admin_1' });
    expect(out.status).toBe('VERIFIED');
    const data = db.listing.update.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      status: 'VERIFIED',
      moderatedById: 'admin_1',
      rejectionReason: null,
      rejectedAt: null,
    });
    expect(data?.moderatedAt).toBeInstanceOf(Date);
  });

  it('clears rejection metadata when re-approving a REJECTED listing', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'REJECTED' });
    await approveListing(db, { id: 'l1', adminId: 'admin_1' });
    expect(db.listing.update.mock.calls[0]?.[0]?.data?.rejectionReason).toBeNull();
  });

  it('throws LISTING_NOT_FOUND when the row is missing', async () => {
    db.listing.findUnique.mockResolvedValue(null);
    await expect(approveListing(db, { id: 'nope', adminId: 'a' })).rejects.toMatchObject({
      code: 'LISTING_NOT_FOUND',
    });
  });

  it('throws LISTING_NOT_MODERATABLE for DRAFT and SOLD', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'DRAFT' });
    await expect(approveListing(db, { id: 'l1', adminId: 'a' })).rejects.toMatchObject({
      code: 'LISTING_NOT_MODERATABLE',
    });
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'SOLD' });
    await expect(approveListing(db, { id: 'l1', adminId: 'a' })).rejects.toMatchObject({
      code: 'LISTING_NOT_MODERATABLE',
    });
  });
});

describe('rejectListing', () => {
  it('moves PENDING -> REJECTED and records the reason', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'PENDING' });
    const out = await rejectListing(db, {
      id: 'l1',
      adminId: 'admin_1',
      reason: 'Titre foncier manquant',
    });
    expect(out.status).toBe('REJECTED');
    const data = db.listing.update.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Titre foncier manquant',
      moderatedById: 'admin_1',
    });
    expect(data?.rejectedAt).toBeInstanceOf(Date);
  });

  it('throws REASON_REQUIRED on a blank reason', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'PENDING' });
    await expect(
      rejectListing(db, { id: 'l1', adminId: 'a', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    expect(db.listing.update).not.toHaveBeenCalled();
  });
});

describe('deleteListing', () => {
  it('deletes an existing listing', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'VERIFIED' });
    await deleteListing(db, { id: 'l1' });
    expect(db.listing.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });

  it('throws LISTING_NOT_FOUND when the row is missing', async () => {
    db.listing.findUnique.mockResolvedValue(null);
    await expect(deleteListing(db, { id: 'nope' })).rejects.toMatchObject({
      code: 'LISTING_NOT_FOUND',
    });
  });
});

describe('bulkModerate', () => {
  it('splits results into ok and skipped, preserving order and deduping ids', async () => {
    db.listing.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      const id = args.where.id;
      if (id === 'ok1' || id === 'ok2') return { id, status: 'PENDING' };
      if (id === 'draft') return { id, status: 'DRAFT' };
      return null;
    });
    const res = await bulkModerate(db, {
      action: 'approve',
      ids: ['ok1', 'draft', 'missing', 'ok2', 'ok1'],
      adminId: 'admin_1',
    });
    expect(res.ok).toEqual(['ok1', 'ok2']);
    expect(res.skipped).toEqual([
      { id: 'draft', code: 'LISTING_NOT_MODERATABLE' },
      { id: 'missing', code: 'LISTING_NOT_FOUND' },
    ]);
  });

  it('throws REASON_REQUIRED before the loop when rejecting without a reason', async () => {
    await expect(
      bulkModerate(db, { action: 'reject', ids: ['a'], adminId: 'admin_1' }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    expect(db.listing.findUnique).not.toHaveBeenCalled();
  });

  it('attaches partial progress and rethrows on an unexpected mid-batch error', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'x', status: 'PENDING' });
    let calls = 0;
    db.listing.update.mockImplementation(
      async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls += 1;
        if (calls === 2) throw new Error('db exploded');
        return { id: args.where.id, ...args.data };
      },
    );
    const err = await bulkModerate(db, {
      action: 'approve',
      ids: ['a', 'b', 'c'],
      adminId: 'admin_1',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('db exploded');
    expect((err as { partial?: unknown }).partial).toEqual({ ok: ['a'], skipped: [] });
  });

  it('supports bulk delete', async () => {
    db.listing.findUnique.mockResolvedValue({ id: 'x', status: 'VERIFIED' });
    const res = await bulkModerate(db, { action: 'delete', ids: ['x'], adminId: 'admin_1' });
    expect(res.ok).toEqual(['x']);
    expect(db.listing.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
  });
});
