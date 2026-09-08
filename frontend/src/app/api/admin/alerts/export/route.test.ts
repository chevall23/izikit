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
  return new NextRequest(`http://test/api/admin/alerts/export${qs}`);
}

const row = {
  id: 'a1',
  name: 'Villas, "premium"',
  active: true,
  transactionType: 'VENTE',
  propertyTypes: ['VILLA', 'MAISON'],
  country: 'Sénégal',
  cities: ['Dakar', 'Thiès'],
  priceMin: 10_000_000,
  priceMax: null,
  frequency: 'QUOTIDIENNE',
  notifEmail: true,
  notifSms: false,
  notifWhatsapp: true,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  user: { name: 'Agence', email: 'a@t.co' },
  _count: { matches: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.alert.findMany.mockResolvedValue([row] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/alerts/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment (BOM, escaping, joined arrays) and logs alert.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(
      'attachment; filename="alertes-secteur-',
    );
    const text = await res.clone().text();
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(text).toContain('"Villas, ""premium"""');
    expect(text).toContain('VILLA | MAISON');
    expect(text).toContain('Dakar | Thiès');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'alert.export' }) }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.alert.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany with the 5000 cap', async () => {
    await GET(get('?active=false&country=CI&transactionType=LOCATION'));
    const arg = prismaMock.alert.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ active: false, country: 'CI', transactionType: 'LOCATION' });
    expect(arg.take).toBe(5000);
  });
});
