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
const mockLegalDocGroupBy = vi.mocked(prismaMock.legalDocument.groupBy);
const admin = seedAdmin({ id: 'admin_1' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function get(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/users/export${qs}`);
}

const row = {
  id: 'u1',
  name: 'Ama "Prestige" Kouassi',
  email: 'ama@t.co',
  phone: '+225000',
  accountType: 'TENANT_BUYER',
  role: 'USER',
  status: 'ACTIVE',
  country: 'CI',
  city: 'Abidjan',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  _count: { listings: 3, ownedOrganizations: 0 },
  tokenWallet: { balance: 42 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.user.findMany.mockResolvedValue([row] as never);
  mockLegalDocGroupBy.mockResolvedValue([] as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/users/export', () => {
  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await GET(get())).status).toBe(401);
  });

  it('returns a CSV attachment with escaped fields, derived type/status, and logs user.export', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="utilisateurs-');
    const text = await res.clone().text();
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef); // UTF-8 BOM
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(text).toContain('"Ama ""Prestige"" Kouassi"');
    expect(text).toContain('PARTICULIER');
    expect(text).toContain('ACTIF');
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'user.export' }) }),
    );
  });

  it('sets x-export-truncated when the row cap is hit', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce(new Array(5000).fill(row) as never);
    const res = await GET(get());
    expect(res.headers.get('x-export-truncated')).toBe('true');
  });

  it('passes filters through to findMany', async () => {
    await GET(get('?status=SUSPENDED&country=SN'));
    const arg = prismaMock.user.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ status: 'SUSPENDED', country: 'SN' });
    expect(arg.take).toBe(5000);
  });

  it('scopes to `ids` instead of filters when provided (bulk-selection export)', async () => {
    await GET(get('?ids=u1,u2,u3&status=SUSPENDED'));
    const arg = prismaMock.user.findMany.mock.calls[0]![0]!;
    expect(arg.where).toEqual({ id: { in: ['u1', 'u2', 'u3'] } });
  });

  it('marks an OWNER_AGENT with all docs verified as AGENCE when they own an organization', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        ...row,
        id: 'u2',
        accountType: 'OWNER_AGENT',
        _count: { listings: 1, ownedOrganizations: 1 },
      },
    ] as never);
    mockLegalDocGroupBy.mockResolvedValueOnce([{ userId: 'u2', _count: { _all: 6 } }] as never);
    const text = await (await GET(get())).text();
    expect(text).toContain('AGENCE');
    expect(text).toContain('ACTIF');
  });
});
