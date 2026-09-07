import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function call(id: string) {
  return {
    req: new NextRequest(`http://test/api/admin/listings/${id}/approve`, { method: 'POST' }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'PENDING' } as never);
  prismaMock.listing.update.mockResolvedValue({ id: 'l1', status: 'VERIFIED' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/listings/[id]/approve', () => {
  it('403s when CSRF fails', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const { req, ctx } = call('l1');
    expect((await POST(req, ctx)).status).toBe(403);
  });

  it('approves a PENDING listing and logs listing.approve', async () => {
    const { req, ctx } = call('l1');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).listing.status).toBe('VERIFIED');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing.approve',
          targetId: 'l1',
          metadata: { from: 'PENDING' },
        }),
      }),
    );
  });

  it('404s when the listing is missing', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(null as never);
    const { req, ctx } = call('nope');
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it('409s when the listing is a DRAFT', async () => {
    prismaMock.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'DRAFT' } as never);
    const { req, ctx } = call('l1');
    expect((await POST(req, ctx)).status).toBe(409);
  });
});
