import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/listings/quota', () => ({
  lockUserListingQuota: vi.fn(),
  reactivateHiddenListings: vi.fn(),
}));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { lockUserListingQuota, reactivateHiddenListings } from '@/lib/server/listings/quota';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLock = vi.mocked(lockUserListingQuota);
const mockReactivate = vi.mocked(reactivateHiddenListings);
const NOW = new Date('2026-11-10T12:00:00Z');
const DAY = 86_400_000;

const call = () => POST(new NextRequest('http://test/api/subscriptions/trial', { method: 'POST' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@x.io' } });
  mockLock.mockResolvedValue(undefined);
  mockReactivate.mockResolvedValue(0);
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );
  prismaMock.subscription.upsert.mockImplementation((async (a: { create: object }) => ({
    ...a.create,
  })) as never);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/subscriptions/trial', () => {
  it('rejects CSRF failures and anonymous callers', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('AGENT_ONLY');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('starts a 14-day Pro trial with no tokens and no boost', async () => {
    const res = await call();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ planKey: 'PRO_AGENT', status: 'TRIAL' });
    expect(new Date(body.subscription.currentPeriodEnd).getTime()).toBe(NOW.getTime() + 14 * DAY);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: expect.objectContaining({
          userId: 'u1',
          planKey: 'PRO_AGENT',
          status: 'TRIAL',
          trialStartedAt: NOW,
        }),
        update: expect.objectContaining({
          planKey: 'PRO_AGENT',
          status: 'TRIAL',
          trialStartedAt: NOW,
          canceledAt: null,
        }),
      }),
    );
    const data = JSON.stringify(prismaMock.subscription.upsert.mock.calls[0]![0]);
    expect(data).not.toContain('boostCredits');
    expect(prismaMock.tokenWallet.upsert).not.toHaveBeenCalled();
    expect(prismaMock.tokenTransaction.create).not.toHaveBeenCalled();
  });

  it.each([
    ['already used a trial', { planKey: 'FREE', status: 'EXPIRED', trialStartedAt: new Date() }],
    ['currently on trial', { planKey: 'PRO_AGENT', status: 'TRIAL', trialStartedAt: new Date() }],
    ['paying subscriber', { planKey: 'PRO_AGENT', status: 'ACTIVE', trialStartedAt: null }],
    ['expired after paying', { planKey: 'FREE', status: 'EXPIRED', trialStartedAt: null }],
  ])('409 TRIAL_NOT_AVAILABLE for an agent who is %s, nothing written', async (_n, existing) => {
    prismaMock.subscription.findUnique.mockResolvedValue(existing as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TRIAL_NOT_AVAILABLE');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(mockReactivate).not.toHaveBeenCalled();
  });

  it('reactivates hidden listings within the Pro quota', async () => {
    await call();
    expect(mockReactivate).toHaveBeenCalledWith(expect.anything(), 'u1', 30);
  });

  it.each([
    ['trial already taken', { planKey: 'FREE', status: 'ACTIVE', trialStartedAt: new Date() }],
    ['paid and active', { planKey: 'PRO_AGENT', status: 'ACTIVE', trialStartedAt: null }],
    ['in grace', { planKey: 'PRO_AGENT', status: 'GRACE', trialStartedAt: null }],
    ['canceled', { planKey: 'PRO_AGENT', status: 'CANCELED', trialStartedAt: null }],
    ['lapsed', { planKey: 'FREE', status: 'EXPIRED', trialStartedAt: null }],
    ['running trial', { planKey: 'PRO_AGENT', status: 'TRIAL', trialStartedAt: new Date() }],
  ])('409 TRIAL_NOT_AVAILABLE when %s', async (_n, sub) => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TRIAL_NOT_AVAILABLE');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('reads the subscription only after taking the lock', async () => {
    await call();
    const lockOrder = mockLock.mock.invocationCallOrder.at(-1)!;
    const readOrder = prismaMock.subscription.findUnique.mock.invocationCallOrder.at(-1)!;
    expect(lockOrder).toBeLessThan(readOrder);
  });
});
