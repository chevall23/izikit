import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCsrf = vi.mocked(verifyCsrf);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function call(method: string, id: string, body?: unknown) {
  return {
    req: new NextRequest(`http://test/api/admin/listings/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const detailRow = {
  id: 'l1',
  title: 'Villa',
  city: 'Abidjan',
  country: 'CI',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  price: 1000,
  currency: 'XOF',
  status: 'PENDING',
  description: 'x',
  landmark: null,
  surfaceM2: null,
  capacity: null,
  yearBuilt: null,
  standing: null,
  roomsTotal: null,
  bedrooms: null,
  bathrooms: null,
  kitchens: null,
  amenities: [],
  viewCount: 0,
  rejectionReason: null,
  rejectedAt: null,
  moderatedAt: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  user: { id: 'u1', name: 'Agence', email: 'a@t.co', phone: '+22500' },
  moderatedBy: null,
  photos: [{ id: 'p1', url: 'https://cdn/x.jpg', key: 'x', isPrimary: true, position: 0 }],
  documents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  prismaMock.listing.findUnique.mockResolvedValue(detailRow as never);
  prismaMock.listing.count.mockResolvedValue(0 as never);
  prismaMock.listingInquiry.count.mockResolvedValue(2 as never);
  prismaMock.listingReport.count.mockResolvedValue(1 as never);
  prismaMock.listing.update.mockResolvedValue({ ...detailRow, title: 'New' } as never);
  prismaMock.listing.delete.mockResolvedValue(detailRow as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/listings/[id]', () => {
  it('404s when missing', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('GET', 'nope');
    expect((await GET(req, ctx)).status).toBe(404);
  });

  it('returns detail with owner, counts and photos', async () => {
    const { req, ctx } = call('GET', 'l1');
    const body = await (await GET(req, ctx)).json();
    expect(body.listing).toMatchObject({
      id: 'l1',
      owner: { id: 'u1', name: 'Agence', email: 'a@t.co', phone: '+22500' },
      inquiryCount: 2,
      reportCount: 1,
    });
    expect(body.listing.photos).toHaveLength(1);
  });
});

describe('PATCH /api/admin/listings/[id]', () => {
  it('403s when CSRF fails', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const { req, ctx } = call('PATCH', 'l1', { title: 'New' });
    expect((await PATCH(req, ctx)).status).toBe(403);
  });

  it('updates fields and logs listing.update', async () => {
    const { req, ctx } = call('PATCH', 'l1', { title: 'New' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ title: 'New' }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listing.update', targetId: 'l1' }),
      }),
    );
  });

  it('400s when forcing status REJECTED without a reason', async () => {
    const { req, ctx } = call('PATCH', 'l1', { status: 'REJECTED' });
    expect((await PATCH(req, ctx)).status).toBe(400);
  });

  it('404s when the listing is missing', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('PATCH', 'nope', { title: 'x' });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });
});

describe('DELETE /api/admin/listings/[id]', () => {
  it('deletes and logs listing.delete, returns 204', async () => {
    const { req, ctx } = call('DELETE', 'l1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(204);
    expect(prismaMock.listing.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'listing.delete', targetId: 'l1' }),
      }),
    );
  });

  it('404s when the listing is missing', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = call('DELETE', 'nope');
    expect((await DELETE(req, ctx)).status).toBe(404);
  });
});
