import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/alerts/matching', () => ({ runMatchingForNewRequest: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewRequest } from '@/lib/server/alerts/matching';
import { GET, PATCH } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const mockLog = vi.mocked(logAdminAction);
const mockRematch = vi.mocked(runMatchingForNewRequest);

const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function call(method: string, id: string, body?: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/property-requests/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const existingRow = {
  id: 'r1',
  userId: null,
  status: 'EN_ATTENTE',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Côte d’Ivoire',
  city: 'Abidjan',
  budgetMin: 1000,
  budgetMax: 5000,
  clientName: 'Aminata Koné',
};

const detailRow = {
  id: 'r1',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Côte d’Ivoire',
  city: 'Abidjan',
  landmark: null,
  bedrooms: null,
  salons: null,
  surfaceM2: null,
  capacity: null,
  amenities: [],
  priority: 'Normale',
  budgetMin: 1000,
  budgetMax: 5000,
  financing: 'Comptant',
  delay: 'Flexible',
  clientName: 'Aminata Koné',
  clientPhone: '+225 07 00 11 22',
  clientEmail: null,
  clientType: 'Particulier',
  source: 'Site web',
  notes: null,
  status: 'EN_ATTENTE',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  user: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  mockRematch.mockResolvedValue(0);
  prismaMock.propertyRequest.findUnique.mockResolvedValue(detailRow as never);
  prismaMock.propertyRequest.update.mockResolvedValue({} as never);
});

describe('GET /api/admin/property-requests/[id]', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    const { req, ctx } = call('GET', 'r1');
    expect((await GET(req, ctx)).status).toBe(401);
  });

  it('404s when the request does not exist', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('GET', 'missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('REQUEST_NOT_FOUND');
  });

  it('returns the serialized request with assignedAgent', async () => {
    const { req, ctx } = call('GET', 'r1');
    const body = await (await GET(req, ctx)).json();
    expect(body.request).toMatchObject({ id: 'r1', status: 'EN_ATTENTE', assignedAgent: null });
  });
});

describe('PATCH /api/admin/property-requests/[id]', () => {
  it('fails CSRF before touching the DB', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    const { req, ctx } = call('PATCH', 'r1', { status: 'CLOTUREE' });
    expect((await PATCH(req, ctx)).status).toBe(403);
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('400s when neither status nor rematch is given', async () => {
    const { req, ctx } = call('PATCH', 'r1', {});
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('400s on an unknown status value', async () => {
    const { req, ctx } = call('PATCH', 'r1', { status: 'DONE' });
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it('404s when the request does not exist', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('PATCH', 'missing', { status: 'CLOTUREE' });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });

  it('archives: updates status to CLOTUREE and audits', async () => {
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, status: 'CLOTUREE' } as never);
    const { req, ctx } = call('PATCH', 'r1', { status: 'CLOTUREE' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { status: 'CLOTUREE' } }),
    );
    expect(mockRematch).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        action: 'property_request.update',
        targetType: 'PropertyRequest',
        targetId: 'r1',
      }),
    );
    const body = await res.json();
    expect(body.notifiedAgents).toBeUndefined();
  });

  it('does not call update when the status is unchanged', async () => {
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'r1', { status: 'EN_ATTENTE' });
    await PATCH(req, ctx);
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('transmits: sets EN_COURS, re-runs matching and returns the agent count', async () => {
    mockRematch.mockResolvedValueOnce(3);
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, status: 'EN_COURS' } as never);
    const { req, ctx } = call('PATCH', 'r1', { status: 'EN_COURS', rematch: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRematch).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ id: 'r1', city: 'Abidjan', transactionType: 'VENTE' }),
    );
    const body = await res.json();
    expect(body.notifiedAgents).toBe(3);
  });

  it('still returns 200 with notifiedAgents 0 when matching throws', async () => {
    mockRematch.mockRejectedValueOnce(new Error('boom'));
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, status: 'EN_COURS' } as never);
    const { req, ctx } = call('PATCH', 'r1', { status: 'EN_COURS', rematch: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).notifiedAgents).toBe(0);
  });

  it('400s on an empty patch object', async () => {
    const { req, ctx } = call('PATCH', 'r1', {});
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it('edits fields and audits the changed field names', async () => {
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, city: 'Bouaké', priority: 'Urgent' } as never);
    const { req, ctx } = call('PATCH', 'r1', {
      city: 'Bouaké',
      budgetMax: 9_000_000,
      priority: 'Urgent',
      notes: 'Relance client',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: { city: 'Bouaké', budgetMax: 9_000_000, priority: 'Urgent', notes: 'Relance client' },
      }),
    );
    const meta = mockLog.mock.calls[0]![1]!.metadata as { fields: string[] };
    expect(meta.fields).toEqual(expect.arrayContaining(['city', 'budgetMax', 'priority', 'notes']));
  });

  it('clears a nullable column when sent explicit null', async () => {
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce(detailRow as never);
    const { req, ctx } = call('PATCH', 'r1', { landmark: null, clientEmail: null });
    await PATCH(req, ctx);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { landmark: null, clientEmail: null } }),
    );
  });

  it('rejects an invalid enum value in the patch', async () => {
    const bad = call('PATCH', 'r1', { priority: 'Haute' });
    expect((await PATCH(bad.req, bad.ctx)).status).toBe(400);
  });

  it('rejects an invalid email in the patch', async () => {
    const bad = call('PATCH', 'r1', { clientEmail: 'not-an-email' });
    expect((await PATCH(bad.req, bad.ctx)).status).toBe(400);
  });

  it('re-runs matching with the edited city, not the stale one', async () => {
    mockRematch.mockResolvedValueOnce(2);
    prismaMock.propertyRequest.findUnique
      .mockResolvedValueOnce(existingRow as never)
      .mockResolvedValueOnce({ ...detailRow, city: 'Bouaké' } as never);
    const { req, ctx } = call('PATCH', 'r1', { city: 'Bouaké', rematch: true });
    await PATCH(req, ctx);
    expect(mockRematch).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ city: 'Bouaké' }),
    );
  });
});
