import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { NextResponse } from 'next/server';
import { GET } from './route';
import { encodeCursor } from '@/lib/server/pagination/paginate';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function get(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/listings${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.listing.findMany.mockResolvedValue([] as never);
  prismaMock.listing.count.mockResolvedValue(0 as never);
});

describe('GET /api/admin/listings', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns an empty page with counts, never 404', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ items: [], nextCursor: null });
    expect(body.counts).toMatchObject({
      all: 0,
      pending: 0,
      verified: 0,
      rejected: 0,
      sold: 0,
    });
  });

  it('excludes DRAFT listings when no status filter is given', async () => {
    await GET(get());
    const arg = prismaMock.listing.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: { not: 'DRAFT' } });
  });

  it('applies q, status and price filters to the where clause', async () => {
    await GET(get('?q=villa&status=PENDING&minPrice=1000&maxPrice=5000&country=CI'));
    const arg = prismaMock.listing.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({
      status: 'PENDING',
      country: 'CI',
      price: { gte: 1000, lte: 5000 },
    });
    expect(JSON.stringify(arg.where)).toContain('villa');
  });

  it('passes propertyType, transactionType and the date range into the where clause', async () => {
    await GET(get('?propertyType=VILLA&transactionType=LOCATION&from=2026-01-01&to=2026-06-01'));
    const arg = prismaMock.listing.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ propertyType: 'VILLA', transactionType: 'LOCATION' });
    const where = arg.where as { createdAt: { gte: Date; lte: Date } };
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('keeps the q OR alongside the cursor OR when both are present (AND-combined)', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-07-01T00:00:00Z'), id: 'l9' });
    await GET(get(`?q=villa&cursor=${encodeURIComponent(cursor)}`));
    const arg = prismaMock.listing.findMany.mock.calls[0]![0]!;
    const and = (arg.where as { AND: unknown[] }).AND;
    expect(Array.isArray(and)).toBe(true);
    // first element carries the q → title/city contains OR
    expect(JSON.stringify(and[0])).toContain('villa');
    expect(JSON.stringify(and[0])).toContain('title');
    expect(JSON.stringify(and[0])).toContain('city');
    // second element carries the createdAt keyset cursor OR
    expect(JSON.stringify(and[1])).toContain('createdAt');
    expect((and[1] as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it('maps rows to list shape with owner and thumbnail', async () => {
    prismaMock.listing.findMany.mockResolvedValueOnce([
      {
        id: 'l1',
        title: 'Villa',
        city: 'Abidjan',
        country: 'CI',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        price: 1000,
        currency: 'XOF',
        status: 'PENDING',
        viewCount: 3,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        user: { id: 'u1', name: 'Agence' },
        photos: [{ url: 'https://cdn/x.jpg' }],
      },
    ] as never);
    const body = await (await GET(get())).json();
    expect(body.items[0]).toMatchObject({
      id: 'l1',
      owner: { id: 'u1', name: 'Agence' },
      thumbnailUrl: 'https://cdn/x.jpg',
    });
  });
});
