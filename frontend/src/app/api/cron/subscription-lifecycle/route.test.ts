import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const runSubscriptionLifecycleMock = vi.fn();
vi.mock('@/lib/server/subscriptions/lifecycle', () => ({
  runSubscriptionLifecycle: runSubscriptionLifecycleMock,
}));

const PRICING_FIXTURE = { fixture: 'pricing' };
vi.mock('@/lib/server/pricing', () => ({
  getPricing: vi.fn(async () => PRICING_FIXTURE),
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  runSubscriptionLifecycleMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/subscription-lifecycle', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/subscription-lifecycle', () => {
  it('returns 401 and does not run the lifecycle when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runSubscriptionLifecycleMock).not.toHaveBeenCalled();
  });

  it('passes prisma and pricing to the lifecycle service', async () => {
    runSubscriptionLifecycleMock.mockResolvedValueOnce({
      reminded: 0,
      graced: 0,
      expired: 0,
      hidden: 0,
    });
    const { POST } = await import('./route');
    await POST(makeReq());
    expect(runSubscriptionLifecycleMock).toHaveBeenCalledTimes(1);
    const arg = runSubscriptionLifecycleMock.mock.calls[0]![0] as {
      prisma: unknown;
      pricing: unknown;
    };
    expect(arg.prisma).toBeDefined();
    expect(arg.pricing).toBe(PRICING_FIXTURE);
  });

  it('returns ok plus the lifecycle counters', async () => {
    runSubscriptionLifecycleMock.mockResolvedValueOnce({
      reminded: 2,
      graced: 1,
      expired: 3,
      hidden: 4,
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reminded: 2, graced: 1, expired: 3, hidden: 4 });
  });
});
