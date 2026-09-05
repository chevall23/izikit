// ADMIN-ACCESS-REQUEST-05 — POST /api/admin/access-requests/[id]/approve tests.
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

function makePost(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/access-requests/${id}/approve`, {
    method: 'POST',
  });
}
function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PENDING_REQUEST = {
  id: 'req-1',
  name: 'Kofi Mensah',
  email: 'kofi@example.com',
  phone: '+22967000000',
  passwordHash: '$2a$12$hash',
  status: 'PENDING_REVIEW',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/admin/access-requests/[id]/approve', () => {
  it('creates an ADMIN user and marks the request APPROVED', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'user-new' } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(200);

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ADMIN', email: 'kofi@example.com' }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin-access-request.approve',
          targetId: 'req-1',
        }),
      }),
    );
  });

  it('returns 409 REQUEST_NOT_PENDING for an already-decided request', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
      ...PENDING_REQUEST,
      status: 'APPROVED',
    } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REQUEST_NOT_PENDING');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 409 EMAIL_ALREADY_REGISTERED when a User already has this email', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('EMAIL_ALREADY_REGISTERED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown request id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const res = await POST(makePost('missing'), ctxFor('missing'));
    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireAdmin (ADMIN, not SUPERADMIN) without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
