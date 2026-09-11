import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
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
  return new NextRequest(`http://test/api/admin/alerts${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.alert.findMany.mockResolvedValue([] as never);
  prismaMock.alert.count.mockResolvedValue(0 as never);
});

describe('GET /api/admin/alerts', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('honours the admin rate limiter', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }) as never,
    );
    expect((await GET(get())).status).toBe(429);
  });

  it('returns an empty page with counts, never 404', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ items: [], nextCursor: null });
    expect(body.counts).toMatchObject({ all: 0, active: 0, inactive: 0 });
  });

  it('does not constrain active when no status filter is given', async () => {
    await GET(get());
    const arg = prismaMock.alert.findMany.mock.calls[0]![0]!;
    expect((arg.where as Record<string, unknown>).active).toBeUndefined();
  });

  it('maps active=true / active=false into the where clause', async () => {
    await GET(get('?active=true'));
    expect(prismaMock.alert.findMany.mock.calls[0]![0]!.where).toMatchObject({ active: true });
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(adminCtx);
    mockRateLimit.mockResolvedValue(null);
    prismaMock.alert.findMany.mockResolvedValue([] as never);
    prismaMock.alert.count.mockResolvedValue(0 as never);
    await GET(get('?active=false'));
    expect(prismaMock.alert.findMany.mock.calls[0]![0]!.where).toMatchObject({ active: false });
  });

  it('applies q, country, transactionType, frequency and array filters', async () => {
    await GET(
      get(
        '?q=dakar&country=Sénégal&transactionType=VENTE&frequency=QUOTIDIENNE&city=Dakar&propertyType=VILLA',
      ),
    );
    const where = prismaMock.alert.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({
      country: 'Sénégal',
      transactionType: 'VENTE',
      frequency: 'QUOTIDIENNE',
      cities: { array_contains: ['Dakar'] },
      propertyTypes: { array_contains: ['VILLA'] },
    });
    expect(JSON.stringify(where)).toContain('dakar');
  });

  it('excludes active from the counts where clause', async () => {
    await GET(get('?active=true&country=Sénégal'));
    const allCountArg = prismaMock.alert.count.mock.calls[0]![0]!;
    expect(allCountArg.where).toMatchObject({ country: 'Sénégal' });
    expect((allCountArg.where as Record<string, unknown>).active).toBeUndefined();
  });

  it('AND-combines the filter with the cursor keyset', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-07-01T00:00:00Z'), id: 'a9' });
    await GET(get(`?q=dakar&cursor=${encodeURIComponent(cursor)}`));
    const and = (prismaMock.alert.findMany.mock.calls[0]![0]!.where as { AND: unknown[] }).AND;
    expect(Array.isArray(and)).toBe(true);
    expect(JSON.stringify(and[0])).toContain('dakar');
    expect(JSON.stringify(and[1])).toContain('createdAt');
  });

  it('maps rows to list shape with owner and matchCount', async () => {
    prismaMock.alert.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        name: 'Villas Dakar',
        transactionType: 'VENTE',
        propertyTypes: ['VILLA'],
        country: 'Sénégal',
        cities: ['Dakar'],
        priceMin: 10_000_000,
        priceMax: null,
        frequency: 'QUOTIDIENNE',
        notifWhatsapp: true,
        notifEmail: true,
        notifSms: false,
        active: true,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        user: { id: 'u1', name: 'Agence Dakar' },
        _count: { matches: 4 },
      },
    ] as never);
    const body = await (await GET(get())).json();
    expect(body.items[0]).toMatchObject({
      id: 'a1',
      owner: { id: 'u1', name: 'Agence Dakar' },
      matchCount: 4,
      propertyTypes: ['VILLA'],
      cities: ['Dakar'],
    });
  });
});
