// ADMIN-ACCESS-REQUEST-06 — POST /api/admin/access-requests/[id]/reject tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePost(
  id: string,
  body: unknown = {},
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/access-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
    id: 'req-1',
    name: 'Kofi Mensah',
    email: 'kofi@example.com',
    status: 'PENDING_REVIEW',
  } as never);
  prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/access-requests/[id]/reject', () => {
  it('marks the request REJECTED with the given reason', async () => {
    const { req, ctx } = makePost('req-1', { reason: 'Email non vérifiable' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    expect(prismaMock.adminAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDING_REVIEW' },
      data: expect.objectContaining({
        status: 'REJECTED',
        rejectionReason: 'Email non vérifiable',
      }),
    });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin-access-request.reject',
          targetId: 'req-1',
        }),
      }),
    );
  });

  it('accepts an omitted reason', async () => {
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
  });

  it('returns 409 REQUEST_NOT_PENDING when already decided', async () => {
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 0 } as never);
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REQUEST_NOT_PENDING');
  });

  it('returns 404 for an unknown request id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePost('missing', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
