// ALERTS-02 — POST /api/alerts quota tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/alerts/matching', () => ({ runMatchingForNewAlert: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const body = {
  name: 'Villas Cotonou',
  transactionType: 'LOCATION',
  propertyTypes: ['VILLA'],
  country: 'Bénin',
  cities: ['Cotonou'],
  notifWhatsapp: false,
  notifEmail: true,
  notifSms: false,
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/alerts', {
    method: 'POST',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const futureSub = (planKey: string) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey,
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.alert.count.mockResolvedValue(0 as never);
  prismaMock.alert.create.mockResolvedValue({
    id: 'a1',
    name: body.name,
    active: true,
    createdAt: new Date(),
  } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('POST /api/alerts quota', () => {
  it('refuses a FREE agent with 403 ALERT_QUOTA_REACHED (limit 0)', async () => {
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'ALERT_QUOTA_REACHED',
      planKey: 'FREE',
      limit: 0,
    });
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it('lets a PRO agent create below 10 and refuses at 10', async () => {
    futureSub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(9 as never);
    expect((await POST(makePost())).status).toBe(201);
    prismaMock.alert.count.mockResolvedValue(10 as never);
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ limit: 10 });
  });

  it('does not count for an Agence agent', async () => {
    futureSub('AGENCY_PREMIUM');
    expect((await POST(makePost())).status).toBe(201);
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('refuses a seeker with AGENT_ONLY, nothing created', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
    prismaMock.alert.count.mockResolvedValue(0 as never);
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('AGENT_ONLY');
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });
});
