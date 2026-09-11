import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/alerts/matching', () => ({ runMatchingForNewAlert: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewAlert } from '@/lib/server/alerts/matching';
import { GET, PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const mockLog = vi.mocked(logAdminAction);
const mockRematch = vi.mocked(runMatchingForNewAlert);

const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function call(method: string, id: string, body?: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/alerts/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const existingRow = {
  id: 'a1',
  userId: 'u1',
  active: true,
  name: 'Villas Dakar',
  transactionType: 'VENTE',
  propertyTypes: ['VILLA'],
  country: 'Sénégal',
  cities: ['Dakar'],
  priceMin: 10_000_000,
  priceMax: 50_000_000,
  notifEmail: true,
  notifSms: false,
  notifWhatsapp: true,
};

const detailRow = {
  ...existingRow,
  frequency: 'QUOTIDIENNE',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  user: { id: 'u1', name: 'Agence Dakar', email: 'agence@t.co', phone: '+221770000001' },
  matches: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  mockRematch.mockResolvedValue(0);
  prismaMock.alert.findUnique.mockResolvedValue(detailRow as never);
  prismaMock.alert.update.mockResolvedValue({} as never);
  prismaMock.alert.delete.mockResolvedValue({} as never);
});

describe('GET /api/admin/alerts/[id]', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    const { req, ctx } = call('GET', 'a1');
    expect((await GET(req, ctx)).status).toBe(401);
  });

  it('404s when the alert does not exist', async () => {
    prismaMock.alert.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('GET', 'missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ALERT_NOT_FOUND');
  });

  it('serializes owner + arrays', async () => {
    const { req, ctx } = call('GET', 'a1');
    const body = await (await GET(req, ctx)).json();
    expect(body.alert).toMatchObject({
      id: 'a1',
      owner: { id: 'u1', email: 'agence@t.co' },
      propertyTypes: ['VILLA'],
      cities: ['Dakar'],
    });
  });
});

describe('PATCH /api/admin/alerts/[id]', () => {
  it('fails CSRF before touching the DB', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    const { req, ctx } = call('PATCH', 'a1', { active: false });
    expect((await PATCH(req, ctx)).status).toBe(403);
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('400s on an empty patch', async () => {
    const { req, ctx } = call('PATCH', 'a1', {});
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it('404s when the alert does not exist', async () => {
    prismaMock.alert.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('PATCH', 'missing', { active: false });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });

  it('toggles active and audits with previousActive', async () => {
    prismaMock.alert.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, active: false } as never);
    const { req, ctx } = call('PATCH', 'a1', { active: false });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { active: false } }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'alert.update', targetId: 'a1' }),
    );
  });

  it('edits fields and records the changed field names', async () => {
    prismaMock.alert.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'a1', {
      name: 'Villas premium Dakar',
      cities: ['Dakar', 'Thiès'],
      priceMax: 80_000_000,
    });
    await PATCH(req, ctx);
    expect(prismaMock.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Villas premium Dakar', cities: ['Dakar', 'Thiès'], priceMax: 80_000_000 },
      }),
    );
    const meta = mockLog.mock.calls[0]![1]!.metadata as { fields: string[] };
    expect(meta.fields).toEqual(expect.arrayContaining(['name', 'cities', 'priceMax']));
  });

  it('rejects priceMin > priceMax against the merged values', async () => {
    prismaMock.alert.findUnique.mockResolvedValueOnce(existingRow as never);
    const { req, ctx } = call('PATCH', 'a1', { priceMin: 90_000_000 });
    expect((await PATCH(req, ctx)).status).toBe(400);
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('clears a nullable price bound with explicit null', async () => {
    prismaMock.alert.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'a1', { priceMax: null });
    await PATCH(req, ctx);
    expect(prismaMock.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priceMax: null } }),
    );
  });

  it('rematch re-runs matching with merged values and returns the count', async () => {
    mockRematch.mockResolvedValueOnce(3);
    prismaMock.alert.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'a1', { cities: ['Bouaké'], rematch: true });
    const res = await PATCH(req, ctx);
    expect(mockRematch).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ id: 'a1', cities: ['Bouaké'], userId: 'u1' }),
    );
    expect((await res.json()).notifiedRequests).toBe(3);
  });

  it('still 200 with notifiedRequests 0 when matching throws', async () => {
    mockRematch.mockRejectedValueOnce(new Error('boom'));
    prismaMock.alert.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'a1', { rematch: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).notifiedRequests).toBe(0);
  });
});

describe('DELETE /api/admin/alerts/[id]', () => {
  it('fails CSRF first', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    const { req, ctx } = call('DELETE', 'a1');
    expect((await DELETE(req, ctx)).status).toBe(403);
    expect(prismaMock.alert.delete).not.toHaveBeenCalled();
  });

  it('404s when missing', async () => {
    prismaMock.alert.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('DELETE', 'missing');
    expect((await DELETE(req, ctx)).status).toBe(404);
  });

  it('deletes and audits alert.delete', async () => {
    prismaMock.alert.findUnique.mockResolvedValueOnce({
      id: 'a1',
      name: 'Villas Dakar',
      userId: 'u1',
    } as never);
    const { req, ctx } = call('DELETE', 'a1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(prismaMock.alert.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'alert.delete', targetId: 'a1' }),
    );
  });
});
