import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/public/agent-verification', () => ({
  verifiedAgentIds: vi.fn().mockResolvedValue(new Set<string>()),
}));

import { searchPublicListings, type ListingSearch } from './listings';

const row = (id: string) => ({
  id,
  title: `Annonce ${id}`,
  city: 'Cotonou',
  country: 'Bénin',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  price: 1_000_000,
  currency: 'XOF',
  bedrooms: null,
  bathrooms: null,
  surfaceM2: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  photos: [],
  _count: { photos: 0 },
  user: { id: 'u1', name: 'Agent', avatarUrl: null },
});

const search = (over: Partial<ListingSearch> = {}): ListingSearch => ({
  page: 1,
  limit: 18,
  sort: 'recent',
  ...over,
});

type FindArgs = {
  where: { boostedUntil?: unknown; id?: { in?: string[]; notIn?: string[] } };
  skip?: number;
  take?: number;
};

// Routes the three kinds of findMany by what they ask for.
function mockListings(opts: { boosted: string[]; rest: string[] }) {
  prismaMock.listing.findMany.mockImplementation((async (args: FindArgs) => {
    if (args.where.boostedUntil) return opts.boosted.map((id) => ({ id }));
    if (args.where.id?.in) return args.where.id.in.map(row);
    return opts.rest.filter((id) => !(args.where.id?.notIn ?? []).includes(id)).map(row);
  }) as never);
  prismaMock.listing.count.mockResolvedValue(opts.rest.length as never);
  vi.mocked(prismaMock.listing.groupBy).mockResolvedValue([] as never);
}

const restCall = () =>
  prismaMock.listing.findMany.mock.calls
    .map((c) => c[0] as FindArgs)
    .find((a) => !a.where.boostedUntil && !a.where.id?.in);

beforeEach(() => {
  mockListings({ boosted: [], rest: [] });
});

describe('searchPublicListings — pinned boosts', () => {
  it('puts the pinned listings first on page 1, flagged boosted, and excludes them from the rest', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2', 'r3', 'b1', 'b2'] });
    const res = await searchPublicListings(search());
    const ids = res.items.map((i) => i.id);
    expect(ids.slice(0, 2).sort()).toEqual(['b1', 'b2']);
    expect(res.items.slice(0, 2).every((i) => i.boosted)).toBe(true);
    expect(res.items.slice(2).every((i) => !i.boosted)).toBe(true);
    expect(ids.filter((id) => id === 'b1')).toHaveLength(1);
    expect(ids).toContain('r1');
  });

  it('keeps the total untouched and shrinks the page-1 take by the pinned count', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2'] });
    const res = await searchPublicListings(search());
    expect(res.total).toBe(2);
    expect(restCall()?.take).toBe(16);
    expect(restCall()?.skip).toBe(0);
  });

  it('page 2 shows no pinned listing but still excludes them and shifts the skip', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2', 'b1', 'b2'] });
    const res = await searchPublicListings(search({ page: 2 }));
    expect(res.items.some((i) => i.boosted)).toBe(false);
    expect([...(restCall()?.where.id?.notIn ?? [])].sort()).toEqual(['b1', 'b2']);
    expect(restCall()?.skip).toBe(16);
    expect(restCall()?.take).toBe(18);
  });

  it('never pins more than 3, nor more than the page limit', async () => {
    mockListings({ boosted: ['b1', 'b2', 'b3', 'b4', 'b5'], rest: ['r1'] });
    expect((await searchPublicListings(search())).items.filter((i) => i.boosted)).toHaveLength(3);
    expect(
      (await searchPublicListings(search({ limit: 2 }))).items.filter((i) => i.boosted),
    ).toHaveLength(2);
  });

  it('does nothing special when no listing is boosted', async () => {
    mockListings({ boosted: [], rest: ['r1', 'r2'] });
    const res = await searchPublicListings(search());
    expect(res.items.map((i) => i.id)).toEqual(['r1', 'r2']);
    expect(res.items.every((i) => !i.boosted)).toBe(true);
  });

  it('only looks for boosted listings among VERIFIED ones matching the filters', async () => {
    mockListings({ boosted: [], rest: [] });
    await searchPublicListings(search({ city: 'Cotonou', propertyType: 'VILLA' }));
    const candidateCall = prismaMock.listing.findMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown> })
      .find((a) => a.where.boostedUntil);
    expect(candidateCall?.where).toMatchObject({
      status: 'VERIFIED',
      propertyType: 'VILLA',
      city: { contains: 'Cotonou', mode: 'insensitive' },
    });
  });
});
