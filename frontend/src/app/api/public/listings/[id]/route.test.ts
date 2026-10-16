// PUBLIC-LISTING-DETAIL-01 — GET /api/public/listings/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/geocode', () => ({
  geocodeCity: vi.fn().mockResolvedValue({ lat: 6.36, lon: 2.42 }),
}));

vi.mock('@/lib/server/middleware', () => ({ optionalAuth: vi.fn() }));

import { optionalAuth } from '@/lib/server/middleware';
import { __resetViewDedup } from '@/lib/server/analytics/view-dedup';
import { GET } from './route';

const mockOptionalAuth = vi.mocked(optionalAuth);

function makeListingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    title: 'Villa duplex standing',
    description: 'Belle villa',
    landmark: null,
    city: 'Cocody',
    country: 'Bénin',
    propertyType: 'VILLA',
    transactionType: 'VENTE',
    price: 185_000_000,
    currency: 'XOF',
    surfaceM2: 320,
    capacity: null,
    yearBuilt: 2022,
    standing: 'HIGH',
    roomsTotal: 6,
    bedrooms: 5,
    bathrooms: 4,
    kitchens: 1,
    amenities: ['POOL', 'PARKING'],
    status: 'VERIFIED',
    viewCount: 10,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    photos: [{ url: 'https://example.com/1.jpg', isPrimary: true }],
    user: { id: 'user-1', name: 'Kofi Atta', avatarUrl: null, phone: '+22990000000' },
    ...overrides,
  };
}

function makeGet(
  id = 'listing-1',
  headers: Record<string, string> = {},
): {
  req: NextRequest;
  ctx: { params: Promise<{ id: string }> };
} {
  return {
    req: new NextRequest(`http://test/api/public/listings/${id}`, { headers }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetViewDedup();
  mockOptionalAuth.mockResolvedValue(null);
  prismaMock.listing.findUnique.mockResolvedValue(makeListingRow() as never);
  prismaMock.listing.update.mockResolvedValue({ viewCount: 11 } as never);
  prismaMock.listing.findMany.mockResolvedValue([] as never);
  prismaMock.listingView.create.mockResolvedValue({} as never);
  vi.mocked(prismaMock.legalDocument.groupBy).mockResolvedValue([] as never);
});

describe('GET /api/public/listings/[id]', () => {
  it('404s when the listing does not exist', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('LISTING_NOT_FOUND');
  });

  it('404s when the listing is not VERIFIED', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(
      makeListingRow({ status: 'DRAFT' }) as never,
    );
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('increments viewCount and returns the updated value', async () => {
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(prismaMock.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'listing-1' },
        data: { viewCount: { increment: 1 } },
      }),
    );
    const body = await res.json();
    expect(body.viewCount).toBe(11);
  });

  it('does not fail the request when the viewCount increment throws', async () => {
    prismaMock.listing.update.mockRejectedValueOnce(new Error('db down'));
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.viewCount).toBe(10);
  });

  it('records a ListingView with a classified source', async () => {
    const req = new NextRequest('http://test/api/public/listings/listing-1', {
      headers: { referer: 'https://www.google.com/search?q=villa' },
    });
    await GET(req, { params: Promise.resolve({ id: 'listing-1' }) });
    expect(prismaMock.listingView.create).toHaveBeenCalledWith({
      data: { listingId: 'listing-1', source: 'ORGANIC' },
    });
  });

  it('does not fail the request when the ListingView write throws', async () => {
    prismaMock.listingView.create.mockRejectedValueOnce(new Error('db down'));
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it('maps agent fields, never including email', async () => {
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(body.agent).toEqual({
      name: 'Kofi Atta',
      avatarUrl: null,
      phone: '+22990000000',
      seed: 'user-1',
      verified: false,
    });
    expect(JSON.stringify(body)).not.toContain('"email"');
  });

  it('marks the agent verified once all 3 legal documents are validated', async () => {
    vi.mocked(prismaMock.legalDocument.groupBy).mockResolvedValue([
      { userId: 'user-1', _count: { _all: 3 } },
    ] as never);
    const { req, ctx } = makeGet();
    const body = await (await GET(req, ctx)).json();
    expect(body.agent.verified).toBe(true);
  });

  it('parses amenities as a string array', async () => {
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(body.amenities).toEqual(['POOL', 'PARKING']);
  });

  it('includes geocoded location from geocodeCity', async () => {
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(body.location).toEqual({ lat: 6.36, lon: 2.42 });
  });

  it('queries similar listings with the same country and propertyType, excluding itself', async () => {
    const { req, ctx } = makeGet();
    await GET(req, ctx);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'VERIFIED',
          country: 'Bénin',
          propertyType: 'VILLA',
          id: { not: 'listing-1' },
        },
        take: 3,
      }),
    );
  });
});

describe('GET /api/public/listings/[id] view counting', () => {
  async function call(id = 'listing-1', headers: Record<string, string> = {}) {
    const { req, ctx } = makeGet(id, headers);
    return GET(req, ctx);
  }

  const visitor = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 test' };

  it('counts a visitor once, however many times they reload the page', async () => {
    for (let i = 0; i < 12; i++) {
      const { req, ctx } = makeGet('listing-1', visitor);
      expect((await GET(req, ctx)).status).toBe(200);
    }
    expect(prismaMock.listing.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.listingView.create).toHaveBeenCalledTimes(1);
  });

  it('returns the stored count, not an incremented one, on a repeated visit', async () => {
    await call('listing-1', visitor);
    const { req, ctx } = makeGet('listing-1', visitor);
    const body = await (await GET(req, ctx)).json();
    expect(body.viewCount).toBe(10);
  });

  it('counts a different visitor (other IP) separately', async () => {
    await call('listing-1', visitor);
    const other = { ...visitor, 'x-forwarded-for': '198.51.100.9' };
    await call('listing-1', other);
    expect(prismaMock.listing.update).toHaveBeenCalledTimes(2);
  });

  it('counts the same visitor again on another listing', async () => {
    await call('listing-1', visitor);
    prismaMock.listing.findUnique.mockResolvedValue(makeListingRow({ id: 'listing-2' }) as never);
    await call('listing-2', visitor);
    expect(prismaMock.listing.update).toHaveBeenCalledTimes(2);
  });

  it('never counts the owner looking at their own listing', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'user-1' } } as never);
    // The real lookup selects userId; the listing row of this suite does not carry it.
    prismaMock.listing.findUnique.mockResolvedValue(makeListingRow({ userId: 'user-1' }) as never);
    const { req, ctx } = makeGet('listing-1', visitor);
    expect((await GET(req, ctx)).status).toBe(200);
    expect(prismaMock.listing.update).not.toHaveBeenCalled();
    expect(prismaMock.listingView.create).not.toHaveBeenCalled();
  });

  it('counts a logged-in visitor who is not the owner', async () => {
    mockOptionalAuth.mockResolvedValue({ user: { sub: 'someone-else' } } as never);
    prismaMock.listing.findUnique.mockResolvedValue(makeListingRow({ userId: 'user-1' }) as never);
    const { req, ctx } = makeGet('listing-1', visitor);
    await GET(req, ctx);
    expect(prismaMock.listing.update).toHaveBeenCalledTimes(1);
  });

  it('always counts a visitor whose IP is unknown (cannot be told apart)', async () => {
    for (let i = 0; i < 3; i++) {
      const { req, ctx } = makeGet('listing-1');
      await GET(req, ctx);
    }
    expect(prismaMock.listing.update).toHaveBeenCalledTimes(3);
  });
});
