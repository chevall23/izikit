import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
import { NextResponse } from 'next/server';
import { GET, POST } from './route';
import { encodeCursor } from '@/lib/server/pagination/paginate';
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

function get(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/property-requests${qs}`);
}
function post(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/property-requests', {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const validBody = {
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Sénégal',
  city: 'Dakar',
  financing: 'Comptant',
  delay: 'Flexible',
  clientName: 'Aminata Koné',
  clientPhone: '+221770000001',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockReturnValue(null);
  mockRematch.mockResolvedValue(0);
  prismaMock.propertyRequest.findMany.mockResolvedValue([] as never);
  prismaMock.propertyRequest.count.mockResolvedValue(0 as never);
  prismaMock.propertyRequest.create.mockResolvedValue({
    id: 'r_new',
    status: 'EN_ATTENTE',
    createdAt: new Date('2026-07-20T00:00:00Z'),
  } as never);
});

describe('GET /api/admin/property-requests', () => {
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
    expect(body.counts).toMatchObject({ all: 0, enAttente: 0, enCours: 0, cloturee: 0 });
  });

  it('does not constrain status when no status filter is given ("Toutes")', async () => {
    await GET(get());
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect((arg.where as Record<string, unknown>).status).toBeUndefined();
  });

  it('applies q, status, priority and budget filters to the where clause', async () => {
    await GET(
      get('?q=villa&status=EN_ATTENTE&priority=Urgent&minBudget=1000&maxBudget=5000&country=CI'),
    );
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({
      status: 'EN_ATTENTE',
      priority: 'Urgent',
      country: 'CI',
      budgetMin: { gte: 1000 },
      budgetMax: { lte: 5000 },
    });
    expect(JSON.stringify(arg.where)).toContain('villa');
  });

  it('passes propertyType, transactionType and the date range into the where clause', async () => {
    await GET(get('?propertyType=VILLA&transactionType=LOCATION&from=2026-01-01&to=2026-06-01'));
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({ propertyType: 'VILLA', transactionType: 'LOCATION' });
    const where = arg.where as { createdAt: { gte: Date; lte: Date } };
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('excludes status from the counts where clause', async () => {
    await GET(get('?status=EN_ATTENTE&country=CI'));
    // counts.all is the 2nd prisma call (index 1); its where keeps country, drops status
    const allCountArg = prismaMock.propertyRequest.count.mock.calls[0]![0]!;
    expect(allCountArg.where).toMatchObject({ country: 'CI' });
    expect((allCountArg.where as Record<string, unknown>).status).toBeUndefined();
  });

  it('keeps the q OR alongside the cursor OR when both are present (AND-combined)', async () => {
    const cursor = encodeCursor({ createdAt: new Date('2026-07-01T00:00:00Z'), id: 'r9' });
    await GET(get(`?q=villa&cursor=${encodeURIComponent(cursor)}`));
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    const and = (arg.where as { AND: unknown[] }).AND;
    expect(Array.isArray(and)).toBe(true);
    expect(JSON.stringify(and[0])).toContain('villa');
    expect(JSON.stringify(and[0])).toContain('clientName');
    expect(JSON.stringify(and[1])).toContain('createdAt');
    expect((and[1] as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it('maps rows to list shape with owner (or null)', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        clientName: 'Aminata Koné',
        clientPhone: '+225 07 00 11 22',
        clientEmail: 'aminata@example.com',
        country: 'CI',
        city: 'Abidjan',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        budgetMin: 80_000_000,
        budgetMax: 200_000_000,
        priority: 'Urgent',
        status: 'EN_ATTENTE',
        createdAt: new Date('2026-07-12T00:00:00Z'),
        user: null,
      },
      {
        id: 'r2',
        clientName: 'Kwame Asante',
        clientPhone: '+221 77 30 44 12',
        clientEmail: null,
        country: 'SN',
        city: 'Dakar',
        propertyType: 'APPARTEMENT',
        transactionType: 'LOCATION',
        budgetMin: null,
        budgetMax: null,
        priority: 'Normale',
        status: 'EN_COURS',
        createdAt: new Date('2026-07-10T00:00:00Z'),
        user: { id: 'u1', name: 'Agence Dakar' },
      },
    ] as never);
    const body = await (await GET(get())).json();
    expect(body.items[0]).toMatchObject({ id: 'r1', owner: null, budgetMin: 80_000_000 });
    expect(body.items[1]).toMatchObject({ id: 'r2', owner: { id: 'u1', name: 'Agence Dakar' } });
  });
});

describe('POST /api/admin/property-requests', () => {
  it('fails CSRF before touching the DB', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    expect((await POST(post(validBody))).status).toBe(403);
    expect(prismaMock.propertyRequest.create).not.toHaveBeenCalled();
  });

  it('401s when not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }) as never,
    );
    expect((await POST(post(validBody))).status).toBe(401);
  });

  it('400s on an incomplete body', async () => {
    expect((await POST(post({ city: 'Dakar' }))).status).toBe(400);
  });

  it('creates an unowned request, runs matching and audits property_request.create', async () => {
    mockRematch.mockResolvedValueOnce(2);
    const res = await POST(post({ ...validBody, budgetMin: 10_000_000, priority: 'Urgent' }));
    expect(res.status).toBe(201);
    const arg = prismaMock.propertyRequest.create.mock.calls[0]![0]!;
    expect(arg.data).toMatchObject({
      userId: null,
      city: 'Dakar',
      priority: 'Urgent',
      source: 'Admin',
    });
    expect(mockRematch).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ id: 'r_new', city: 'Dakar', clientName: 'Aminata Koné' }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'property_request.create', targetId: 'r_new' }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ request: { id: 'r_new' }, notifiedAgents: 2 });
  });

  it('still returns 201 when matching throws', async () => {
    mockRematch.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    expect((await res.json()).notifiedAgents).toBe(0);
  });
});
