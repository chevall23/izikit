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

function get(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/finances/transactions${qs}`);
}

const row = {
  id: 'o1',
  amount: 40000,
  currency: 'XOF',
  status: 'PAID',
  provider: 'bictorys',
  paymentMethod: 'WAVE',
  metadata: { kind: 'token_purchase', packKey: 'STANDARD' },
  createdAt: new Date('2026-07-01T00:00:00Z'),
  paidAt: new Date('2026-07-01T00:05:00Z'),
  customerEmail: null,
  customerName: null,
  user: { id: 'u1', name: 'Awa Diallo', email: 'awa@t.co', avatarUrl: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([row] as never);
  prismaMock.order.count.mockResolvedValue(1);
});

describe('GET /api/admin/finances/transactions', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns empty 200 (never 404) on no rows', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([] as never);
    prismaMock.order.count.mockResolvedValueOnce(0);
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('derives `type` from metadata.kind and includes the buyer', async () => {
    const res = await GET(get());
    const body = (await res.json()) as {
      items: { id: string; type: string; user: { name: string | null } | null }[];
    };
    expect(body.items[0]).toMatchObject({ id: 'o1', type: 'TOKEN_PURCHASE' });
    expect(body.items[0]?.user?.name).toBe('Awa Diallo');
  });

  it('falls back to guest customer name/email when userId is null', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { ...row, user: null, customerEmail: 'guest@t.co', customerName: 'Guest' },
    ] as never);
    const res = await GET(get());
    const body = (await res.json()) as { items: { user: { email: string | null } | null }[] };
    expect(body.items[0]?.user?.email).toBe('guest@t.co');
  });

  it('filters type=TOKEN_PURCHASE via a metadata Json-path where clause', async () => {
    await GET(get('?type=TOKEN_PURCHASE'));
    const arg = prismaMock.order.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({
      metadata: { path: ['kind'], equals: 'token_purchase' },
    });
  });

  it('filters status=REFUNDED', async () => {
    await GET(get('?status=REFUNDED'));
    const arg = prismaMock.order.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'REFUNDED' });
  });

  it('rate limits admin per-userId — propagates 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(get());
    expect(res.status).toBe(429);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });
});
