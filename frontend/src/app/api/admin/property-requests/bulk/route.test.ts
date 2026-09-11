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
import { POST } from './route';
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

function post(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/property-requests/bulk', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const row = (id: string, status = 'EN_ATTENTE') => ({
  id,
  userId: null,
  status,
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'CI',
  city: 'Abidjan',
  budgetMin: 1000,
  budgetMax: 5000,
  clientName: 'Client',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  mockRematch.mockResolvedValue(1);
  prismaMock.propertyRequest.findMany.mockResolvedValue([row('r1'), row('r2')] as never);
  prismaMock.propertyRequest.update.mockResolvedValue({} as never);
});

describe('POST /api/admin/property-requests/bulk', () => {
  it('fails CSRF before touching the DB', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    expect((await POST(post({ action: 'archive', ids: ['r1'] }))).status).toBe(403);
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await POST(post({ action: 'archive', ids: ['r1'] }))).status).toBe(401);
  });

  it('400s on a bad action or empty ids', async () => {
    expect((await POST(post({ action: 'nuke', ids: ['r1'] }))).status).toBe(400);
    expect((await POST(post({ action: 'archive', ids: [] }))).status).toBe(400);
  });

  it('archives every found row and reports missing ids as skipped', async () => {
    const res = await POST(post({ action: 'archive', ids: ['r1', 'r2', 'ghost'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toEqual(['r1', 'r2']);
    expect(body.skipped).toEqual(['ghost']);
    expect(body.notifiedAgents).toBeUndefined();
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CLOTUREE' } }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'property_request.bulk-archive' }),
    );
  });

  it('transmit sets EN_COURS, re-runs matching per row and sums the agent count', async () => {
    mockRematch.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const res = await POST(post({ action: 'transmit', ids: ['r1', 'r2'] }));
    const body = await res.json();
    expect(mockRematch).toHaveBeenCalledTimes(2);
    expect(body.notifiedAgents).toBe(5);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_COURS' } }),
    );
  });

  it('skips the status write when a row is already at the target status', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([
      row('r1', 'CLOTUREE'),
      row('r2', 'EN_ATTENTE'),
    ] as never);
    await POST(post({ action: 'archive', ids: ['r1', 'r2'] }));
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledTimes(1);
  });

  it('one failing row does not abort the batch', async () => {
    prismaMock.propertyRequest.update
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({} as never);
    const res = await POST(post({ action: 'archive', ids: ['r1', 'r2'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toEqual(['r1']);
    expect(body.ok).toEqual(['r2']);
  });

  it('a matching failure never fails the row', async () => {
    mockRematch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(4);
    const body = await (await POST(post({ action: 'transmit', ids: ['r1', 'r2'] }))).json();
    expect(body.ok).toEqual(['r1', 'r2']);
    expect(body.notifiedAgents).toBe(4);
  });
});
