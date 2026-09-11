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

function call(id: string, body: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/listing-reports/${id}/notes`, {
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
  mockCsrf.mockReturnValue(null);
  prismaMock.listingReport.findUnique.mockResolvedValue({ id: 'r1' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/listing-reports/[id]/notes', () => {
  it('400s on an empty note', async () => {
    const { req, ctx } = call('r1', { note: '' });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('404s when the report does not exist', async () => {
    prismaMock.listingReport.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('missing', { note: 'hello' });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it('logs a listing-report.note AdminAction with the note text', async () => {
    const { req, ctx } = call('r1', { note: 'Called the owner, no answer' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing-report.note',
          targetType: 'ListingReport',
          targetId: 'r1',
          metadata: { note: 'Called the owner, no answer' },
        }),
      }),
    );
  });

  it('rejects when CSRF fails', async () => {
    mockCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const { req, ctx } = call('r1', { note: 'x' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });
});
