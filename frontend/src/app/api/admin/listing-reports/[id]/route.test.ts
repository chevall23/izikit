// ADMIN-LISTING-REPORTS-02 — PATCH /api/admin/listing-reports/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, PATCH } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makePatch(
  id: string,
  body: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/listing-reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

function makeGet(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/listing-reports/${id}`),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.listingReport.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING' } as never);
  prismaMock.listingReport.update.mockResolvedValue({ id: 'r1', status: 'DISMISSED' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('PATCH /api/admin/listing-reports/[id]', () => {
  it('404s when the report does not exist', async () => {
    prismaMock.listingReport.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makePatch('missing', { status: 'DISMISSED' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('400s on an invalid status', async () => {
    const { req, ctx } = makePatch('r1', { status: 'NOPE' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('updates the status and logs an admin action', async () => {
    const { req, ctx } = makePatch('r1', { status: 'DISMISSED' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.listingReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { status: 'DISMISSED' } }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listing-report.resolve', targetId: 'r1' }),
      }),
    );
  });
});

describe('GET /api/admin/listing-reports/[id]', () => {
  it('404s when the report does not exist', async () => {
    prismaMock.listingReport.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns the report with derived severity, listing owner, and a synthetic + audit-derived history', async () => {
    prismaMock.listingReport.findUnique.mockResolvedValueOnce({
      id: 'r1',
      reason: 'SCAM',
      detail: 'suspicious',
      status: 'PENDING',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      listing: {
        id: 'l1',
        title: 'Villa',
        status: 'VERIFIED',
        city: 'Abidjan',
        country: 'CI',
        price: 1000,
        currency: 'XOF',
        photos: [{ url: 'https://x/photo.jpg' }],
        user: { id: 'u1', name: 'Owner', email: 'owner@t.co', phone: null },
      },
    } as never);
    prismaMock.adminAction.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        action: 'listing-report.note',
        metadata: { note: 'Called the owner' },
        createdAt: new Date('2026-08-01T01:00:00Z'),
        actor: { name: 'Admin One', email: 'admin1@t.co' },
      },
    ] as never);

    const { req, ctx } = makeGet('r1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        severity: string;
        listing: { thumbnailUrl: string | null; owner: { id: string } | null };
      };
      history: { id: string; kind: string; actor: string | null }[];
    };
    expect(body.report.severity).toBe('CRITICAL');
    expect(body.report.listing.thumbnailUrl).toBe('https://x/photo.jpg');
    expect(body.report.listing.owner?.id).toBe('u1');
    expect(body.history).toHaveLength(2);
    expect(body.history[0]).toMatchObject({ id: 'received', kind: 'RECEIVED' });
    expect(body.history[1]).toMatchObject({ id: 'a1', kind: 'NOTE', actor: 'Admin One' });
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const { req, ctx } = makeGet('r1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.listingReport.findUnique).not.toHaveBeenCalled();
  });
});
