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
  return new NextRequest(`http://test/api/admin/finances/transactions/export${qs}`);
}

const row = {
  id: 'o1',
  amount: 40000,
  currency: 'XOF',
  status: 'PAID',
  provider: 'bictorys',
  paymentMethod: 'WAVE',
  metadata: { kind: 'token_purchase' },
  createdAt: new Date('2026-07-01T00:00:00Z'),
  paidAt: new Date('2026-07-01T00:05:00Z'),
  customerEmail: null,
  user: { name: 'Awa "Prestige" Diallo', email: 'awa@t.co' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([row] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/finances/transactions/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment with the derived type and logs finances.transactions.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="transactions-');
    const text = await res.text();
    expect(text).toContain('TOKEN_PURCHASE');
    expect(text).toContain('"Awa ""Prestige"" Diallo"');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'finances.transactions.export' }),
      }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany', async () => {
    await GET(get('?status=REFUNDED'));
    const arg = prismaMock.order.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'REFUNDED' });
    expect(arg.take).toBe(5000);
  });
});
