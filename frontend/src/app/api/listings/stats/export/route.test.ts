import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const get = (qs = '') =>
  GET(new NextRequest(`http://test/api/listings/stats/export${qs}`, { method: 'GET' }));
const plan = (planKey: string) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey,
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@x.io' } });
  plan('AGENCY_PREMIUM');
  prismaMock.listingView.count.mockResolvedValue(10 as never);
  prismaMock.listingInquiry.count.mockResolvedValue(2 as never);
  prismaMock.visit.count.mockResolvedValue(1 as never);
  prismaMock.listingView.findMany.mockResolvedValue([
    { createdAt: new Date() },
    { createdAt: new Date() },
  ] as never);
  vi.mocked(prismaMock.listingView.groupBy as unknown as () => Promise<unknown>).mockResolvedValue([
    { listingId: 'l1', _count: { _all: 7 } },
  ]);
  prismaMock.listing.findMany.mockResolvedValue([
    {
      id: 'l1',
      title: '=HYPERLINK("http://evil")',
      city: 'Cotonou',
      country: 'Bénin',
      propertyType: 'VILLA',
      transactionType: 'VENTE',
      status: 'VERIFIED',
      price: 5_000_000,
      currency: 'XOF',
      _count: { inquiries: 3 },
    },
  ] as never);
});

describe('GET /api/listings/stats/export', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });

  it('403 PLAN_REQUIRED for a free agent and a Pro agent, no data read', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    let res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_REQUIRED');
    plan('PRO_AGENT');
    res = await get();
    expect(res.status).toBe(403);
    expect(prismaMock.listingView.count).not.toHaveBeenCalled();
  });

  it('400 on an unknown period', async () => {
    const res = await get('?period=bogus');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('serves a CSV download for an Agence agent', async () => {
    const res = await get('?period=7j');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="statistiques-7j-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = await res.text();
    expect(text).toContain('Vues;10;');
    expect(text).toContain(`${new Date().toISOString().slice(0, 10)};2`);
  });

  it('puts per-listing views and contacts in the detail and neutralises formulas', async () => {
    const text = await (await get()).text();
    expect(text).toContain(
      `"'=HYPERLINK(""http://evil"")";Cotonou;Bénin;VILLA;VENTE;VERIFIED;5000000;XOF;7;3`,
    );
  });

  it('only reads the caller own data', async () => {
    await get();
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    expect(prismaMock.listingView.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ listing: { userId: 'u1' } }),
      }),
    );
  });

  it('defaults to 30 days', async () => {
    const res = await get();
    expect(res.headers.get('content-disposition')).toContain('statistiques-30j-');
  });
});
