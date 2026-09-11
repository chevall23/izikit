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
const superadminCtx = {
  user: { sub: 'sa_1', email: 'sa@test.local' },
  admin: { id: 'sa_1', email: 'sa@test.local', role: 'SUPERADMIN' as const },
};

function call(body: unknown) {
  return new NextRequest('http://test/api/admin/users/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/admin/users/bulk', () => {
  it('400s on an unknown action', async () => {
    expect((await POST(call({ action: 'nuke', ids: ['a'] }))).status).toBe(400);
  });

  it('400s on an empty id list', async () => {
    expect((await POST(call({ action: 'suspend', ids: [] }))).status).toBe(400);
  });

  it('suspends in bulk, skips a missing user, and logs once', async () => {
    prismaMock.user.findUnique.mockImplementation((async (a: { where: { id: string } }) => {
      if (a.where.id === 'missing') return null;
      return { id: a.where.id, status: 'ACTIVE', role: 'USER' } as never;
    }) as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await POST(call({ action: 'suspend', ids: ['u1', 'missing', 'u2'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: string[]; skipped: { id: string; reason: string }[] };
    expect(body.ok).toEqual(['u1', 'u2']);
    expect(body.skipped).toEqual([{ id: 'missing', reason: 'NOT_FOUND' }]);
    expect(prismaMock.adminAction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'user.bulk-suspend',
          metadata: expect.objectContaining({ requested: 3, ok: 2 }),
        }),
      }),
    );
  });

  it('skips restoring a SUSPENDED user when the actor is only ADMIN', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'SUSPENDED',
      role: 'USER',
    } as never);

    const res = await POST(call({ action: 'activate', ids: ['u1'] }));
    const body = (await res.json()) as { ok: string[]; skipped: { id: string; reason: string }[] };
    expect(body.ok).toEqual([]);
    expect(body.skipped).toEqual([{ id: 'u1', reason: 'RESTORE_REQUIRES_SUPERADMIN' }]);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows a SUPERADMIN actor to bulk-restore', async () => {
    mockRequireAdmin.mockResolvedValue(superadminCtx);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'SUSPENDED',
      role: 'USER',
    } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await POST(call({ action: 'activate', ids: ['u1'] }));
    const body = (await res.json()) as { ok: string[] };
    expect(body.ok).toEqual(['u1']);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('is idempotent for a user already at the target status (no update, still ok)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'SUSPENDED',
      role: 'USER',
    } as never);

    const res = await POST(call({ action: 'suspend', ids: ['u1'] }));
    const body = (await res.json()) as { ok: string[] };
    expect(body.ok).toEqual(['u1']);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
