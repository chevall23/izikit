import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const req = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
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
  createdAt: hoursAgo(100),
  clientName: 'Awa',
  clientPhone: '+229',
  clientEmail: null,
  clientType: 'Particulier',
  notes: 'n',
  ...over,
});
const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  requestId: 'r1',
  status: 'ACTIVE',
  tokensSpent: 3,
  createdAt: hoursAgo(1),
  request: req(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.leadPurchase.findMany.mockResolvedValue([purchase()] as never);
});
afterEach(() => vi.useRealTimers());

const get = () => GET(new NextRequest('http://test/api/leads/purchased'));

describe('GET /api/leads/purchased', () => {
  it('401 anonymous / 403 non-agent', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect((await get()).status).toBe(403);
  });

  it('only reads the caller purchases, newest first', async () => {
    await get();
    expect(prismaMock.leadPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'agent-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('returns the contact of an active purchase and allows a report inside 72h', async () => {
    const [item] = (await (await get()).json()).items;
    expect(item).toMatchObject({
      purchaseId: 'p1',
      refunded: false,
      canReport: true,
      contact: { clientName: 'Awa', clientPhone: '+229', notes: 'n' },
    });
  });

  it('closes the report window after 72h', async () => {
    prismaMock.leadPurchase.findMany.mockResolvedValue([
      purchase({ createdAt: hoursAgo(73) }),
    ] as never);
    expect((await (await get()).json()).items[0].canReport).toBe(false);
  });

  it('hides the contact of a refunded purchase', async () => {
    prismaMock.leadPurchase.findMany.mockResolvedValue([purchase({ status: 'REFUNDED' })] as never);
    const [item] = (await (await get()).json()).items;
    expect(item.refunded).toBe(true);
    expect(item.canReport).toBe(false);
    expect(item).not.toHaveProperty('contact');
    expect(JSON.stringify(item)).not.toContain('+229');
    expect(JSON.stringify(item)).not.toContain('Awa');
  });
});
