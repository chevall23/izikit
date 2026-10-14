import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

const base = {
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  country: 'Bénin',
  city: 'Cotonou',
  landmark: null,
  budgetMin: 1,
  budgetMax: 2,
  priority: 'Normale',
  delay: 'Immédiat',
  financing: 'Comptant',
};
const row = (id: string, active: number, mine = false, at = '2026-10-01T00:00:00Z') => ({
  ...base,
  id,
  createdAt: new Date(at),
  _count: { leadPurchases: active },
  leadPurchases: mine ? [{ id: 'p' }] : [],
});

const get = (qs = '') => GET(new NextRequest(`http://test/api/leads${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.propertyRequest.findMany.mockResolvedValue([] as never);
});

describe('GET /api/leads', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    const res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('AGENT_ONLY');
  });

  it('queries only sellable requests, with the country/city filters', async () => {
    await get('?country=Bénin&city=Cotonou');
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({
      userId: null,
      trustStatus: 'TRUSTED',
      status: { not: 'CLOTUREE' },
      country: 'Bénin',
      city: 'Cotonou',
    });
  });

  it('exposes price, slots left and no contact data', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([row('r1', 1)] as never);
    const body = await (await get()).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'r1', price: 3, slotsLeft: 2, purchased: false });
    const json = JSON.stringify(body);
    for (const k of ['clientName', 'clientPhone', 'clientEmail', 'notes']) {
      expect(json).not.toContain(k);
    }
  });

  it('hides full requests the agent has not bought, keeps the ones they bought', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([
      row('full', 3),
      row('mine', 3, true),
    ] as never);
    const body = await (await get()).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['mine']);
    expect(body.items[0].purchased).toBe(true);
  });

  it('paginates with a cursor', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([
      row('a', 0, false, '2026-10-03T00:00:00Z'),
      row('b', 0, false, '2026-10-02T00:00:00Z'),
    ] as never);
    const body = await (await get('?limit=1')).json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeTruthy();
    expect(prismaMock.propertyRequest.findMany.mock.calls[0]![0]!.take).toBe(2);
  });
});
