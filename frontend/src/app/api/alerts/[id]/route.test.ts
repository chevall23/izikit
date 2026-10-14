// ALERTS-04 — PATCH /api/alerts/[id] quota tests (activate / deactivate).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

function makePatch(id: string, payload: unknown) {
  const req = new NextRequest(`http://test/api/alerts/${id}`, {
    method: 'PATCH',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

const stored = (active: boolean) => ({ userId: 'user-1', active }) as never;
const updated = { id: 'a1', name: 'x', active: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'PRO_AGENT',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
  } as never);
  prismaMock.alert.update.mockResolvedValue(updated);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('PATCH /api/alerts/[id] quota', () => {
  it('refuses to reactivate an inactive alert when the plan limit is full', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(false));
    prismaMock.alert.count.mockResolvedValue(10 as never);
    const { req, ctx } = makePatch('a1', { active: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'ALERT_QUOTA_REACHED', limit: 10 });
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('reactivates below the limit, excluding the alert itself from the count', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(false));
    prismaMock.alert.count.mockResolvedValue(9 as never);
    const { req, ctx } = makePatch('a1', { active: true });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.alert.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true, id: { not: 'a1' } },
    });
  });

  it('never blocks a deactivation and skips the quota check', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(true));
    const { req, ctx } = makePatch('a1', { active: false });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('does not recheck an alert that is already active', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(true));
    const { req, ctx } = makePatch('a1', { active: true });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });
});
