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
  return new NextRequest(`http://test/api/admin/property-requests/export${qs}`);
}

const row = {
  id: 'r1',
  status: 'EN_ATTENTE',
  priority: 'Urgent',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  city: 'Abidjan',
  country: 'CI',
  landmark: 'Cocody, "quartier"',
  budgetMin: 1000,
  budgetMax: null,
  financing: 'Comptant',
  delay: 'Flexible',
  clientName: 'Aminata Koné',
  clientPhone: '+2250700112233',
  clientEmail: 'aminata@example.com',
  clientType: 'Particulier',
  source: 'Site web',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  user: { name: 'Agence', email: 'a@t.co' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.propertyRequest.findMany.mockResolvedValue([row] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/property-requests/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment (BOM, escaping) and logs property_request.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="demandes-');
    const text = await res.clone().text();
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(text).toContain('"Cocody, ""quartier"""');
    expect(text).toContain('aminata@example.com');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'property_request.export' }),
      }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany with the 5000 cap', async () => {
    await GET(get('?status=CLOTUREE&country=SN&priority=Urgent'));
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'CLOTUREE', country: 'SN', priority: 'Urgent' });
    expect(arg.take).toBe(5000);
  });
});
