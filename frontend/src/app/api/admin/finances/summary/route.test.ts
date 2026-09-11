import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function get(): NextRequest {
  return new NextRequest('http://test/api/admin/finances/summary');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([] as never);
  prismaMock.user.findMany.mockResolvedValue([] as never);
});

describe('GET /api/admin/finances/summary', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns zeroed KPIs and a 6-entry revenue series with no orders', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpis: {
        tokenRevenue: { amount: number };
        totalRevenue: { amount: number; deltaPct: number | null };
      };
      revenueSeries: unknown[];
      countryShare: unknown[];
    };
    expect(body.kpis.tokenRevenue.amount).toBe(0);
    expect(body.kpis.totalRevenue.amount).toBe(0);
    expect(body.kpis.totalRevenue.deltaPct).toBe(0);
    expect(body.revenueSeries).toHaveLength(6);
    expect(body.countryShare).toEqual([]);
  });

  it('splits revenue by order kind and computes month-over-month delta', async () => {
    // Call order: [thisMonthOrders, lastMonthOrders, trendOrders, thisMonthTxnAll]
    prismaMock.order.findMany
      .mockResolvedValueOnce([
        { amount: 40000, currency: 'XOF', metadata: { kind: 'token_purchase' }, userId: 'u1' },
        {
          amount: 29900,
          currency: 'XOF',
          metadata: { kind: 'subscription_plan_change' },
          userId: 'u2',
        },
      ] as never)
      .mockResolvedValueOnce([{ amount: 20000, metadata: { kind: 'token_purchase' } }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ status: 'PAID' }, { status: 'FAILED' }] as never);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'u1', country: 'Sénégal' },
      { id: 'u2', country: 'Sénégal' },
    ] as never);

    const res = await GET(get());
    const body = (await res.json()) as {
      kpis: {
        tokenRevenue: { amount: number; deltaPct: number };
        subscriptionRevenue: { amount: number };
        totalRevenue: { amount: number };
        transactions: { total: number; succeeded: number; failed: number };
      };
      countryShare: { country: string; amount: number; pct: number }[];
    };
    expect(body.kpis.tokenRevenue.amount).toBe(40000);
    expect(body.kpis.tokenRevenue.deltaPct).toBe(100); // 20000 -> 40000 = +100%
    expect(body.kpis.subscriptionRevenue.amount).toBe(29900);
    expect(body.kpis.totalRevenue.amount).toBe(69900);
    expect(body.kpis.transactions).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.countryShare).toEqual([{ country: 'Sénégal', amount: 69900, pct: 100 }]);
  });

  it('buckets guest-checkout orders (no userId) under "Autre"', async () => {
    prismaMock.order.findMany
      .mockResolvedValueOnce([
        { amount: 15000, currency: 'XOF', metadata: { kind: 'token_purchase' }, userId: null },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const res = await GET(get());
    const body = (await res.json()) as { countryShare: { country: string }[] };
    expect(body.countryShare).toEqual([{ country: 'Autre', amount: 15000, pct: 100 }]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
