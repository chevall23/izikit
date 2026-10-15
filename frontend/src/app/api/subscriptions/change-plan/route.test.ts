// POST /api/subscriptions/change-plan — tests.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth/lockout', () => ({
  isLockedOut: vi.fn().mockResolvedValue(false),
  recordFailure: vi.fn().mockResolvedValue({ count: 1, locked: false }),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn().mockResolvedValue(DEFAULT_PRICING) };
});
vi.mock('@/lib/server/alerts/quota', () => ({
  lockUserAlertQuota: vi.fn().mockResolvedValue(undefined),
  disableExcessAlerts: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/lib/server/listings/quota', () => ({
  lockUserListingQuota: vi.fn().mockResolvedValue(undefined),
  hideExcessListings: vi.fn().mockResolvedValue(0),
}));

import { hideExcessListings, lockUserListingQuota } from '@/lib/server/listings/quota';
import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';
import { getPricing } from '@/lib/server/pricing';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { CSRF_COOKIE_NAME, createAccessToken } from '@/lib/server/auth';
import { POST } from './route';

const CSRF_TOKEN = 'csrf-token-fixture-deadbeef';

function makeReq(opts: {
  bearer?: string;
  body?: unknown;
  csrf?: string | null;
  csrfCookieValue?: string | null;
}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.csrf !== null && opts.csrf !== undefined) headers['x-csrf-token'] = opts.csrf;
  if (opts.csrfCookieValue !== null && opts.csrfCookieValue !== undefined) {
    headers.cookie = `${CSRF_COOKIE_NAME}=${opts.csrfCookieValue}`;
  }
  return new NextRequest('https://test/api/subscriptions/change-plan', {
    method: 'POST',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

let validToken: string;

beforeEach(async () => {
  validToken = await createAccessToken({
    sub: 'user_1',
    email: 'user@example.com',
    tokenVersion: 0,
  });
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user_1',
    email: 'user@example.com',
    tokenVersion: 0,
  } as never);
  vi.mocked(hideExcessListings).mockClear().mockResolvedValue(0);
  vi.mocked(lockUserListingQuota).mockClear().mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
});

describe('POST /api/subscriptions/change-plan — trial eligibility is not reset', () => {
  const downgrade = () =>
    POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'FREE' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
  const upsertArgs = () => prismaMock.subscription.upsert.mock.calls.at(-1)![0];

  beforeEach(() => {
    prismaMock.subscription.upsert.mockResolvedValue({
      planKey: 'FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      canceledAt: null,
    } as never);
  });

  it.each([
    ['an active Pro', { planKey: 'PRO_AGENT', status: 'ACTIVE' }],
    ['a Pro in grace', { planKey: 'PRO_AGENT', status: 'GRACE' }],
    ['a canceled Pro', { planKey: 'PRO_AGENT', status: 'CANCELED' }],
    ['a running trial', { planKey: 'PRO_AGENT', status: 'TRIAL' }],
    ['an Agence', { planKey: 'AGENCY_PREMIUM', status: 'ACTIVE' }],
    ['a lapsed account', { planKey: 'FREE', status: 'EXPIRED' }],
  ])(
    'leaves a "has been paid/subscribed" mark (EXPIRED) when %s goes back to FREE',
    async (_n, row) => {
      prismaMock.subscription.findUnique.mockResolvedValue(row as never);
      expect((await downgrade()).status).toBe(200);
      expect(upsertArgs().update).toMatchObject({ planKey: 'FREE', status: 'EXPIRED' });
    },
  );

  it('keeps a never-subscribed account ACTIVE on FREE (it can still try the trial)', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'FREE',
      status: 'ACTIVE',
    } as never);
    await downgrade();
    expect(upsertArgs().update).toMatchObject({ planKey: 'FREE', status: 'ACTIVE' });
  });

  it('creates an ACTIVE FREE row when there is none', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    await downgrade();
    expect(upsertArgs().create).toMatchObject({ planKey: 'FREE', status: 'ACTIVE' });
  });

  it('reads the previous row under the listing-quota lock', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    await downgrade();
    expect(vi.mocked(lockUserListingQuota).mock.invocationCallOrder.at(-1)!).toBeLessThan(
      prismaMock.subscription.findUnique.mock.invocationCallOrder.at(-1)!,
    );
  });
});

describe('POST /api/subscriptions/change-plan', () => {
  it('downgrades to FREE immediately (no charge)', async () => {
    prismaMock.subscription.upsert.mockResolvedValue({
      planKey: 'FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      canceledAt: null,
    } as never);

    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'FREE' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.planKey).toBe('FREE');
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
        update: expect.objectContaining({ planKey: 'FREE' }),
      }),
    );
  });

  it('locks the quota, then hides excess listings down to the FREE limit', async () => {
    prismaMock.subscription.upsert.mockResolvedValue({
      planKey: 'FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      canceledAt: null,
    } as never);

    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'FREE' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );

    expect(res.status).toBe(200);
    expect(lockUserListingQuota).toHaveBeenCalledWith(prismaMock, 'user_1');
    expect(hideExcessListings).toHaveBeenCalledWith(prismaMock, 'user_1', 5);
    const lockOrder = vi.mocked(lockUserListingQuota).mock.invocationCallOrder[0]!;
    const upsertOrder = prismaMock.subscription.upsert.mock.invocationCallOrder[0]!;
    const hideOrder = vi.mocked(hideExcessListings).mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(upsertOrder);
    expect(upsertOrder).toBeLessThan(hideOrder);
    expect(lockUserAlertQuota).toHaveBeenCalledWith(prismaMock, 'user_1');
    expect(disableExcessAlerts).toHaveBeenCalledWith(prismaMock, 'user_1', DEFAULT_PRICING, 'FREE');
    expect(vi.mocked(lockUserListingQuota).mock.invocationCallOrder.at(-1)!).toBeLessThan(
      vi.mocked(lockUserAlertQuota).mock.invocationCallOrder.at(-1)!,
    );
  });

  it('returns 500 when hiding excess listings fails (error not swallowed)', async () => {
    prismaMock.subscription.upsert.mockResolvedValue({
      planKey: 'FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      canceledAt: null,
    } as never);
    vi.mocked(hideExcessListings).mockRejectedValueOnce(new Error('db down'));

    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'FREE' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );

    expect(res.status).toBe(500);
  });

  it('rejects a paid target with UPGRADE_REQUIRES_PAYMENT', async () => {
    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'PRO_AGENT' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UPGRADE_REQUIRES_PAYMENT');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('rejects a paid target even when the live price is 0', async () => {
    vi.mocked(getPricing).mockResolvedValueOnce({
      ...DEFAULT_PRICING,
      plans: {
        ...DEFAULT_PRICING.plans,
        PRO_AGENT: { ...DEFAULT_PRICING.plans.PRO_AGENT, priceFcfa: 0 },
      },
    });
    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'PRO_AGENT' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('UPGRADE_REQUIRES_PAYMENT');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('invalid planKey returns VALIDATION_FAILED', async () => {
    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'NOT_A_PLAN' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('missing CSRF header returns 403', async () => {
    const res = await POST(
      makeReq({
        bearer: validToken,
        body: { planKey: 'FREE' },
        csrf: null,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('missing token returns 401', async () => {
    const res = await POST(
      makeReq({
        body: { planKey: 'FREE' },
        csrf: CSRF_TOKEN,
        csrfCookieValue: CSRF_TOKEN,
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });
});
