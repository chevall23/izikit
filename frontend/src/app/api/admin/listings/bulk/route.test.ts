import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function call(body: unknown) {
  return new NextRequest('http://test/api/admin/listings/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.listing.update.mockImplementation(
    (async (a: { where: { id: string } }) =>
      ({ id: a.where.id, status: 'VERIFIED' }) as never) as never,
  );
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/listings/bulk', () => {
  it('400s on an unknown action', async () => {
    expect((await POST(call({ action: 'nuke', ids: ['a'] }))).status).toBe(400);
  });

  it('400s on an empty id list', async () => {
    expect((await POST(call({ action: 'approve', ids: [] }))).status).toBe(400);
  });

  it('400s when rejecting without a reason', async () => {
    expect((await POST(call({ action: 'reject', ids: ['a'] }))).status).toBe(400);
  });

  it('audits the partial batch and rethrows when an unexpected error hits mid-batch', async () => {
    prismaMock.listing.findUnique.mockImplementation(
      (async (a: { where: { id: string } }) =>
        ({ id: a.where.id, status: 'PENDING' }) as never) as never,
    );
    let calls = 0;
    prismaMock.listing.update.mockImplementation((async (a: { where: { id: string } }) => {
      calls += 1;
      if (calls === 2) throw new Error('db exploded');
      return { id: a.where.id, status: 'VERIFIED' } as never;
    }) as never);
    await expect(POST(call({ action: 'approve', ids: ['a', 'b', 'c'] }))).rejects.toThrow(
      'db exploded',
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing.bulk-approve',
          metadata: expect.objectContaining({ requested: 3, ok: 1, aborted: true, skipped: [] }),
        }),
      }),
    );
  });

  it('approves in bulk, returns ok/skipped and logs once', async () => {
    prismaMock.listing.findUnique.mockImplementation((async (a: { where: { id: string } }) => {
      if (a.where.id === 'draft') return { id: 'draft', status: 'DRAFT' } as never;
      return { id: a.where.id, status: 'PENDING' } as never;
    }) as never);
    const res = await POST(call({ action: 'approve', ids: ['ok1', 'draft', 'ok2'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toEqual(['ok1', 'ok2']);
    expect(body.skipped).toEqual([{ id: 'draft', code: 'LISTING_NOT_MODERATABLE' }]);
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing.bulk-approve',
          metadata: {
            requested: 3,
            ok: 2,
            skipped: [{ id: 'draft', code: 'LISTING_NOT_MODERATABLE' }],
          },
        }),
      }),
    );
  });
});
