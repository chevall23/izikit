// LISTINGS-03 — PATCH /api/listings/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { DELETE, GET, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    userId: 'user-1',
    title: '',
    description: null,
    city: '',
    country: '',
    propertyType: 'VILLA',
    transactionType: 'VENTE',
    price: 0,
    currency: 'XOF',
    surfaceM2: null,
    yearBuilt: null,
    standing: null,
    roomsTotal: null,
    bedrooms: null,
    bathrooms: null,
    amenities: [],
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePatch(
  id: string,
  body: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://test/api/listings/${id}`, {
    method: 'PATCH',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function makeDelete(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://test/api/listings/${id}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': 'test-csrf' },
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function makeGet(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://test/api/listings/${id}`, { method: 'GET' });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.listing.findUnique.mockResolvedValue(makeDraft() as never);
  prismaMock.listing.update.mockResolvedValue(makeDraft() as never);
  prismaMock.listingPhoto.count.mockResolvedValue(0 as never);
  prismaMock.listingDocument.findMany.mockResolvedValue([] as never);
});

describe('PATCH /api/listings/[id]', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const { req, ctx } = makePatch('l1', { title: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });

  it('csrf missing returns 403', async () => {
    (verifyCsrf as unknown as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF' }, { status: 403 }),
    );
    const { req, ctx } = makePatch('l1', { title: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const { req, ctx } = makePatch('l1', { price: -5 });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('listing owned by another user returns 404', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({ userId: 'someone-else' }) as never,
    );
    const { req, ctx } = makePatch('l1', { title: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('missing listing returns 404', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null);
    const { req, ctx } = makePatch('l1', { title: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('SOLD listing returns 409 LISTING_NOT_EDITABLE (frozen)', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(makeDraft({ status: 'SOLD' }) as never);
    const { req, ctx } = makePatch('l1', { title: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('LISTING_NOT_EDITABLE');
  });

  it.each(['PENDING', 'VERIFIED'])(
    'lets the owner save a field tweak on a %s (live) listing without re-publishing',
    async (status) => {
      prismaMock.listing.findUnique.mockResolvedValueOnce(makeDraft({ status }) as never);
      const { req, ctx } = makePatch('l1', { title: 'Nouveau titre' });
      const res = await PATCH(req, ctx);
      expect(res.status).toBe(200);
      const args = prismaMock.listing.update.mock.calls[0]?.[0];
      expect(args?.data?.title).toBe('Nouveau titre');
      expect(args?.data?.status).toBeUndefined();
    },
  );

  it('lets the owner edit a REJECTED listing and re-submit it straight to VERIFIED', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({
        status: 'REJECTED',
        title: 'T',
        description: 'D',
        price: 100,
        city: 'C',
        country: 'X',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
      }) as never,
    );
    prismaMock.listingPhoto.count.mockResolvedValueOnce(1 as never);
    prismaMock.listing.update.mockResolvedValueOnce(makeDraft({ status: 'VERIFIED' }) as never);
    const { req, ctx } = makePatch('l1', { publish: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const args = prismaMock.listing.update.mock.calls[0]?.[0];
    expect(args?.data?.status).toBe('VERIFIED');
    expect(args?.data?.rejectionReason).toBeNull();
    expect(args?.data?.rejectedAt).toBeNull();
    expect(args?.data?.moderatedById).toBeNull();
    expect(args?.data?.moderatedAt).toBeNull();
  });

  it('saves a partial draft without requiring every field (publish: false)', async () => {
    const { req, ctx } = makePatch('l1', { title: 'Villa test' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const args = prismaMock.listing.update.mock.calls[0]?.[0];
    expect(args?.data?.title).toBe('Villa test');
    expect(args?.data?.status).toBeUndefined();
  });

  it('publish with missing required fields returns 400 with a missing list', async () => {
    // Default fixture propertyType is VILLA — neither a hall nor a land
    // type, so surfaceM2/capacity aren't required for it (see the
    // "surfaceM2 required only for land listings" / "capacity required
    // only for hall listings" tests below for that conditional branch).
    const { req, ctx } = makePatch('l1', { publish: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PUBLISH_REQUIREMENTS_NOT_MET');
    expect(body.missing).toEqual(
      expect.arrayContaining(['title', 'description', 'price', 'city', 'country', 'photos']),
    );
    expect(body.missing).not.toContain('surfaceM2');
    expect(body.missing).not.toContain('capacity');
    expect(prismaMock.listing.update).not.toHaveBeenCalled();
  });

  it('surfaceM2 is required only for land listings (PARCELLE/DOMAINE)', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({
        title: 'Terrain viabilisé',
        description: 'Beau terrain',
        price: 25_000_000,
        city: 'Cotonou',
        country: 'Bénin',
        propertyType: 'PARCELLE',
      }) as never,
    );
    prismaMock.listingPhoto.count.mockResolvedValueOnce(2 as never);
    const { req, ctx } = makePatch('l1', { publish: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing).toContain('surfaceM2');
    expect(body.missing).not.toContain('capacity');
  });

  it('capacity is required only for hall listings (SALLE_FETE/SALLE_CONFERENCE)', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({
        title: 'Salle de fête climatisée',
        description: 'Belle salle',
        price: 150_000,
        city: 'Cotonou',
        country: 'Bénin',
        propertyType: 'SALLE_FETE',
      }) as never,
    );
    prismaMock.listingPhoto.count.mockResolvedValueOnce(2 as never);
    const { req, ctx } = makePatch('l1', { publish: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing).toContain('capacity');
    expect(body.missing).not.toContain('surfaceM2');
  });

  it('publish succeeds and flips status straight to VERIFIED once every requirement is met', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({
        title: 'Villa moderne',
        description: 'Belle villa',
        price: 120_000_000,
        surfaceM2: 320,
        city: 'Cotonou',
        country: 'Bénin',
      }) as never,
    );
    prismaMock.listingPhoto.count.mockResolvedValueOnce(3 as never);
    prismaMock.listingDocument.findMany.mockResolvedValueOnce([
      { type: 'LAND_TITLE' },
      { type: 'SALE_MANDATE' },
    ] as never);
    const { req, ctx } = makePatch('l1', { publish: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const args = prismaMock.listing.update.mock.calls[0]?.[0];
    expect(args?.data?.status).toBe('VERIFIED');
  });
});

describe('GET /api/listings/[id]', () => {
  it('returns the full listing with photos primary-first, for the owner', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce({
      ...makeDraft({ status: 'VERIFIED' }),
      photos: [
        { id: 'p2', url: 'https://cdn.test-bucket.example/p2.webp', isPrimary: true, position: 1 },
        { id: 'p1', url: 'https://cdn.test-bucket.example/p1.webp', isPrimary: false, position: 0 },
      ],
    } as never);
    const { req, ctx } = makeGet('l1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.id).toBe('l1');
    expect(body.listing.photos[0].id).toBe('p2');
  });

  it("404s when the caller doesn't own the listing (no existence leak)", async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({ userId: 'someone-else' }) as never,
    );
    const { req, ctx } = makeGet('l1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the listing does not exist', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('no auth returns 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const { req, ctx } = makeGet('l1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/listings/[id]', () => {
  it('deletes a listing owned by the caller, regardless of status', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(makeDraft({ status: 'VERIFIED' }) as never);
    prismaMock.listing.delete.mockResolvedValueOnce(makeDraft() as never);
    const { req, ctx } = makeDelete('l1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(prismaMock.listing.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });

  it('404s when the listing does not exist', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null);
    const { req, ctx } = makeDelete('missing');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
    expect(prismaMock.listing.delete).not.toHaveBeenCalled();
  });

  it("404s when the caller doesn't own the listing (no existence leak)", async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeDraft({ userId: 'someone-else' }) as never,
    );
    const { req, ctx } = makeDelete('l1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
    expect(prismaMock.listing.delete).not.toHaveBeenCalled();
  });

  it('csrf missing returns 403', async () => {
    (verifyCsrf as unknown as Mock).mockReturnValueOnce(new Response(null, { status: 403 }));
    const { req, ctx } = makeDelete('l1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.listing.delete).not.toHaveBeenCalled();
  });

  it('no auth returns 401', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    const { req, ctx } = makeDelete('l1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });
});
