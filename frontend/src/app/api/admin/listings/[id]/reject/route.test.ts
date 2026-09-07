import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

function call(id: string, body?: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/listings/${id}/reject`, {
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'PENDING' } as never);
  prismaMock.listing.update.mockResolvedValue({
    id: 'l1',
    status: 'REJECTED',
    rejectionReason: 'Titre foncier manquant',
  } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/listings/[id]/reject', () => {
  it('400s without a reason', async () => {
    const { req, ctx } = call('l1', {});
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('400s on a too-short reason', async () => {
    const { req, ctx } = call('l1', { reason: 'no' });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('rejects a PENDING listing and logs listing.reject', async () => {
    const { req, ctx } = call('l1', { reason: 'Titre foncier manquant' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).listing.status).toBe('REJECTED');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing.reject',
          targetId: 'l1',
          metadata: { from: 'PENDING', reason: 'Titre foncier manquant' },
        }),
      }),
    );
  });

  it('404s when the listing is missing', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(null as never);
    const { req, ctx } = call('nope', { reason: 'Anything valid here' });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it('409s when the listing is SOLD', async () => {
    prismaMock.listing.findUnique.mockResolvedValue({ id: 'l1', status: 'SOLD' } as never);
    const { req, ctx } = call('l1', { reason: 'Anything valid here' });
    expect((await POST(req, ctx)).status).toBe(409);
  });
});
