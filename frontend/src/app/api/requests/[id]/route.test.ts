// REQUESTS-03 — GET /api/requests/[id]: the owner and an agent whose sector
// alert matched the request see all of it (contact details included); anyone
// else gets a 404.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

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
