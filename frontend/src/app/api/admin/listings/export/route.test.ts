import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function get(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/listings/export${qs}`);
}

const row = {
  id: 'l1',
  title: 'Villa, "premium"',
  status: 'VERIFIED',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  city: 'Abidjan',
  country: 'CI',
  price: 1000,
  currency: 'XOF',
  viewCount: 5,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  moderatedAt: null,
  rejectionReason: null,
  user: { name: 'Agence', email: 'a@t.co' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.listing.findMany.mockResolvedValue([row] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/listings/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment with escaped fields and logs listing.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="annonces-');
    const text = await res.clone().text();
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef); // UTF-8 BOM
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(text).toContain('"Villa, ""premium"""');
    expect(text).toContain('a@t.co');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'listing.export' }) }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.listing.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany', async () => {
    await GET(get('?status=REJECTED&country=SN'));
    const arg = prismaMock.listing.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'REJECTED', country: 'SN' });
    expect(arg.take).toBe(5000);
  });
});
