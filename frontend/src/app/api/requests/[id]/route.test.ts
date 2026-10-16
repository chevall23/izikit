// REQUESTS-03 — GET /api/requests/[id]: the owner and an agent whose sector
// alert matched the request see all of it (contact details included); anyone
// else gets a 404. REQUESTS-04 — PATCH closes the owner's own request, for good.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { NextResponse } from 'next/server';
import { GET, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCsrf = vi.mocked(verifyCsrf);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'rq-1',
  userId: null,
  trustStatus: 'TRUSTED',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Bénin',
  city: 'Cotonou',
  clientName: 'Awa Diop',
  clientPhone: '+22997000000',
  clientEmail: 'awa@example.com',
  clientType: 'Particulier',
  source: 'Site web',
  status: 'EN_ATTENTE',
  createdAt: new Date('2026-10-16T08:00:00Z'),
  ...overrides,
});

async function get(id = 'rq-1') {
  const res = await GET(new NextRequest(`http://test/api/requests/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@example.com' } });
  prismaMock.alertMatch.findFirst.mockResolvedValue(null);
});

describe('GET /api/requests/[id]', () => {
  it('404s when the request does not exist', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('gives the owner the full request without the internal trust status', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(row({ userId: 'agent-1' }) as never);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.propertyRequest.clientPhone).toBe('+22997000000');
    expect(body.propertyRequest.userId).toBe('agent-1');
    expect(body.propertyRequest.isOwner).toBe(true);
    expect(body.propertyRequest.trustStatus).toBeUndefined();
    expect(prismaMock.alertMatch.findFirst).not.toHaveBeenCalled();
  });

  it('gives the owner of a matching alert every field, contact details included', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(row() as never);
    prismaMock.alertMatch.findFirst.mockResolvedValue({ id: 'm-1' } as never);

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(prismaMock.alertMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { propertyRequestId: 'rq-1', alert: { userId: 'agent-1' } },
      }),
    );
    expect(body.propertyRequest).toMatchObject({
      id: 'rq-1',
      city: 'Cotonou',
      clientName: 'Awa Diop',
      clientPhone: '+22997000000',
      clientEmail: 'awa@example.com',
      source: 'Site web',
      isOwner: false,
    });
  });

  it("does not reveal the request owner's id or the trust status to a matched agent", async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(
      row({ userId: 'other-agent' }) as never,
    );
    prismaMock.alertMatch.findFirst.mockResolvedValue({ id: 'm-1' } as never);
    const { body } = await get();
    expect(body.propertyRequest.userId).toBeUndefined();
    expect(body.propertyRequest.trustStatus).toBeUndefined();
  });

  it('404s for an agent whose alerts never matched the request', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(row() as never);
    expect((await get()).status).toBe(404);
  });

  it('404s for a request still under review, even with a stale match', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(
      row({ trustStatus: 'REVIEW' }) as never,
    );
    prismaMock.alertMatch.findFirst.mockResolvedValue({ id: 'm-1' } as never);
    expect((await get()).status).toBe(404);
  });
});

async function patch(payload: unknown = { status: 'CLOTUREE' }, id = 'rq-1') {
  const res = await PATCH(
    new NextRequest(`http://test/api/requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

describe('PATCH /api/requests/[id]', () => {
  beforeEach(() => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(row({ userId: 'agent-1' }) as never);
    prismaMock.propertyRequest.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('closes the request of its owner', async () => {
    const { status, body } = await patch();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'CLOTUREE' });
    expect(prismaMock.propertyRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'rq-1', userId: 'agent-1', status: { not: 'CLOTUREE' } },
      data: { status: 'CLOTUREE' },
    });
  });

  it('refuses a CSRF-less call before touching the database', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }) as never);
    expect((await patch()).status).toBe(403);
    expect(prismaMock.propertyRequest.findUnique).not.toHaveBeenCalled();
  });

  it.each([{ status: 'EN_ATTENTE' }, { status: 'EN_COURS' }, { status: 'whatever' }, {}])(
    'never reopens or sets another status (%j)',
    async (payload) => {
      expect((await patch(payload)).status).toBe(400);
      expect(prismaMock.propertyRequest.updateMany).not.toHaveBeenCalled();
    },
  );

  it('404s for a request that is not the caller own, even one they can see through an alert', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(
      row({ userId: 'other-agent' }) as never,
    );
    prismaMock.alertMatch.findFirst.mockResolvedValue({ id: 'm-1' } as never);
    expect((await patch()).status).toBe(404);
    expect(prismaMock.propertyRequest.updateMany).not.toHaveBeenCalled();
  });

  it('404s for an unowned (public) request and for a missing one', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(row({ userId: null }) as never);
    expect((await patch()).status).toBe(404);
    prismaMock.propertyRequest.findUnique.mockResolvedValue(null);
    expect((await patch()).status).toBe(404);
  });

  it('answers 409 when the request is already closed', async () => {
    prismaMock.propertyRequest.updateMany.mockResolvedValue({ count: 0 } as never);
    const { status, body } = await patch();
    expect(status).toBe(409);
    expect(body.error).toBe('REQUEST_ALREADY_CLOSED');
  });
});
