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
  return new NextRequest('http://test/api/admin/listing-reports/stats');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.listingReport.count.mockResolvedValue(0);
  prismaMock.adminAction.count.mockResolvedValue(0);
  prismaMock.adminAction.findMany.mockResolvedValue([] as never);
  prismaMock.listingReport.findMany.mockResolvedValue([] as never);
});

describe('GET /api/admin/listing-reports/stats', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns nulls/zeroes with no data', async () => {
    const res = await GET(get());
    const body = (await res.json()) as {
      pendingCount: number;
      resolvedThisWeek: number;
      avgProcessingTimeMs: number | null;
    };
    expect(body).toEqual({ pendingCount: 0, resolvedThisWeek: 0, avgProcessingTimeMs: null });
  });

  it('computes average processing time from AdminAction timestamps minus report createdAt', async () => {
    prismaMock.listingReport.count.mockResolvedValueOnce(3);
    prismaMock.adminAction.count.mockResolvedValueOnce(2);
    prismaMock.adminAction.findMany.mockResolvedValueOnce([
      { targetId: 'r1', createdAt: new Date('2026-08-01T04:00:00Z') },
      { targetId: 'r2', createdAt: new Date('2026-08-02T02:00:00Z') },
    ] as never);
    prismaMock.listingReport.findMany.mockResolvedValueOnce([
      { id: 'r1', createdAt: new Date('2026-08-01T00:00:00Z') }, // 4h
      { id: 'r2', createdAt: new Date('2026-08-02T00:00:00Z') }, // 2h
    ] as never);

    const res = await GET(get());
    const body = (await res.json()) as {
      pendingCount: number;
      resolvedThisWeek: number;
      avgProcessingTimeMs: number;
    };
    expect(body.pendingCount).toBe(3);
    expect(body.resolvedThisWeek).toBe(2);
    expect(body.avgProcessingTimeMs).toBe(3 * 60 * 60 * 1000); // avg(4h, 2h) = 3h
  });
});
