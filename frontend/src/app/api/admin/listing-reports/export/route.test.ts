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
  return new NextRequest(`http://test/api/admin/listing-reports/export${qs}`);
}

const row = {
  id: 'r1',
  reason: 'SCAM',
  detail: 'Suspicious, "urgent" wire transfer',
  status: 'PENDING',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  listing: { id: 'l1', title: 'Villa', city: 'Abidjan', country: 'CI' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.listingReport.findMany.mockResolvedValue([row] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/listing-reports/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment with the derived severity and logs listing-report.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="signalements-');
    const text = await res.text();
    expect(text).toContain('CRITICAL');
    expect(text).toContain('"Suspicious, ""urgent"" wire transfer"');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listing-report.export' }),
      }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.listingReport.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany', async () => {
    await GET(get('?status=DISMISSED&severity=CRITICAL'));
    const arg = prismaMock.listingReport.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'DISMISSED', reason: { in: ['SCAM', 'FAKE'] } });
    expect(arg.take).toBe(5000);
  });
});
