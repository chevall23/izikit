// ADMIN-ACCESS-REQUEST-03 — GET /api/admin/access-requests tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.adminAccessRequest.findMany.mockResolvedValue([] as never);
});

describe('GET /api/admin/access-requests', () => {
  it('defaults to the PENDING_REVIEW status filter', async () => {
    await GET(makeGet('http://test/api/admin/access-requests'));
    expect(prismaMock.adminAccessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING_REVIEW' }) }),
    );
  });

  it('applies an explicit status filter', async () => {
    await GET(makeGet('http://test/api/admin/access-requests?status=APPROVED'));
    expect(prismaMock.adminAccessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('never selects passwordHash', async () => {
    await GET(makeGet('http://test/api/admin/access-requests'));
    const selectArg = prismaMock.adminAccessRequest.findMany.mock.calls[0]?.[0]?.select as
      | Record<string, unknown>
      | undefined;
    expect(selectArg).not.toHaveProperty('passwordHash');
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/access-requests'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findMany).not.toHaveBeenCalled();
  });
});
