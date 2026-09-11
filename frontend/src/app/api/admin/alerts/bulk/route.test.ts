import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const mockLog = vi.mocked(logAdminAction);

const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function post(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/alerts/bulk', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const row = (id: string, active = true) => ({ id, active });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.alert.findMany.mockResolvedValue([row('a1'), row('a2')] as never);
  prismaMock.alert.update.mockResolvedValue({} as never);
  prismaMock.alert.delete.mockResolvedValue({} as never);
});

describe('POST /api/admin/alerts/bulk', () => {
  it('fails CSRF before touching the DB', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    expect((await POST(post({ action: 'deactivate', ids: ['a1'] }))).status).toBe(403);
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('400s on a bad action or empty ids', async () => {
    expect((await POST(post({ action: 'nuke', ids: ['a1'] }))).status).toBe(400);
    expect((await POST(post({ action: 'delete', ids: [] }))).status).toBe(400);
  });

  it('deactivates every found row and reports missing ids as skipped', async () => {
    const res = await POST(post({ action: 'deactivate', ids: ['a1', 'a2', 'ghost'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toEqual(['a1', 'a2']);
    expect(body.skipped).toEqual(['ghost']);
    expect(prismaMock.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'alert.bulk-deactivate' }),
    );
  });

  it('skips the write when a row is already at the target active state', async () => {
    prismaMock.alert.findMany.mockResolvedValueOnce([row('a1', true), row('a2', false)] as never);
    await POST(post({ action: 'activate', ids: ['a1', 'a2'] }));
    expect(prismaMock.alert.update).toHaveBeenCalledTimes(1);
  });

  it('deletes on action=delete', async () => {
    await POST(post({ action: 'delete', ids: ['a1', 'a2'] }));
    expect(prismaMock.alert.delete).toHaveBeenCalledTimes(2);
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('one failing row does not abort the batch', async () => {
    prismaMock.alert.delete
      .mockRejectedValueOnce(new Error('fk'))
      .mockResolvedValueOnce({} as never);
    const body = await (await POST(post({ action: 'delete', ids: ['a1', 'a2'] }))).json();
    expect(body.failed).toEqual(['a1']);
    expect(body.ok).toEqual(['a2']);
  });
});
