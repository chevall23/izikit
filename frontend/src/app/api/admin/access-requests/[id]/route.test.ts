// ADMIN-ACCESS-REQUEST-04 — GET /api/admin/access-requests/[id] tests.
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

function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/access-requests/${id}`, { method: 'GET' });
}
function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/access-requests/[id]', () => {
  it('returns the request detail', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      name: 'Kofi Mensah',
      email: 'kofi@example.com',
      phone: '+22967000000',
      status: 'PENDING_REVIEW',
      emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
      reviewedAt: null,
      rejectionReason: null,
      createdUserId: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    } as never);

    const res = await GET(makeGet('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessRequest.id).toBe('req-1');
  });

  it('returns 404 for an unknown id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('missing'), ctxFor('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('ACCESS_REQUEST_NOT_FOUND');
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
