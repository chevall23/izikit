import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/server/alerts/quota', () => ({
  lockUserAlertQuota: vi.fn(),
  disableExcessAlerts: vi.fn(),
}));
vi.mock('@/lib/server/listings/quota', () => ({
  hideExcessListings: vi.fn(),
  lockUserListingQuota: vi.fn(),
}));

import { createNotification } from '@/lib/server/notifications';
import { hideExcessListings, lockUserListingQuota } from '@/lib/server/listings/quota';
import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';
import { GRACE_PERIOD_MS } from './effective-plan';
import { runSubscriptionLifecycle } from './lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-11-10T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);
const mockNotify = vi.mocked(createNotification);
const mockHide = vi.mocked(hideExcessListings);
const mockLock = vi.mocked(lockUserListingQuota);
const mockDisable = vi.mocked(disableExcessAlerts);
const mockAlertLock = vi.mocked(lockUserAlertQuota);

beforeEach(() => {
  mockNotify.mockClear();
  mockHide.mockClear();
  mockLock.mockReset().mockResolvedValue(undefined);
  mockDisable.mockReset().mockResolvedValue(0);
  mockAlertLock.mockReset().mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation(async (fn: unknown) =>
    (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );
  mockNotify.mockResolvedValue({} as never);
  mockHide.mockResolvedValue(0);
  prismaMock.subscription.findMany.mockResolvedValue([]);
});

const run = () => runSubscriptionLifecycle({ prisma: prismaMock, pricing: DEFAULT_PRICING, now });

describe('reminders', () => {
  it('sends the J-3 reminder when 3 days or fewer remain, J-7 otherwise', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        { userId: 'a', currentPeriodEnd: at(2.5) },
        { userId: 'b', currentPeriodEnd: at(6) },
      ] as never)
      .mockResolvedValue([]);
    const r = await run();
    expect(r.reminded).toBe(2);
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toEqual([
      `sub-reminder:a:${at(2.5).toISOString()}:3`,
      `sub-reminder:b:${at(6).toISOString()}:7`,
    ]);
  });

  it('does not count a notification that was already sent (deduplicated)', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(2) }] as never)
      .mockResolvedValue([]);
    mockNotify.mockResolvedValue(null);
    expect((await run()).reminded).toBe(0);
  });
});

describe('grace', () => {
  it('moves a lapsed ACTIVE subscription to GRACE and notifies once', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-1) }] as never) // lapsed
      .mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    const r = await run();
    expect(r.graced).toBe(1);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'a',
        planKey: { not: 'FREE' },
        status: 'ACTIVE',
        currentPeriodEnd: { lte: now },
      },
      data: { status: 'GRACE' },
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0]?.[1]).toMatchObject({ type: 'SUBSCRIPTION_GRACE' });
  });

  it('skips the notification when another run already moved it', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-1) }] as never)
      .mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    expect((await run()).graced).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('expiry', () => {
  it('expires after the grace window: FREE, EXPIRED, hides the excess, notifies', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([]) // lapsed
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never); // to expire
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(4);
    const r = await run();
    expect(r).toMatchObject({ expired: 1, hidden: 4 });
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'a',
        planKey: { not: 'FREE' },
        OR: [
          { status: 'GRACE', currentPeriodEnd: { lte: new Date(now.getTime() - GRACE_PERIOD_MS) } },
          { status: 'CANCELED', currentPeriodEnd: { lte: now } },
        ],
      },
      data: { planKey: 'FREE', status: 'EXPIRED' },
    });
    expect(mockLock).toHaveBeenCalledWith(prismaMock, 'a');
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.subscription.updateMany.mock.invocationCallOrder[0] as number,
    );
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockHide.mock.invocationCallOrder[0] as number,
    );
    expect(mockHide).toHaveBeenCalledWith(prismaMock, 'a', 5);
    expect(mockNotify.mock.calls.at(-1)?.[1]).toMatchObject({ type: 'SUBSCRIPTION_EXPIRED' });
  });

  it('deactivates excess alerts after hiding listings (lock order) and tells the user', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([]) // lapsed
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never); // to expire
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(1);
    mockDisable.mockResolvedValue(2);
    await run();
    expect(mockAlertLock).toHaveBeenCalledWith(prismaMock, 'a');
    expect(mockDisable).toHaveBeenCalledWith(prismaMock, 'a', DEFAULT_PRICING, 'FREE');
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockAlertLock.mock.invocationCallOrder[0] as number,
    );
    expect(mockNotify.mock.calls.at(-1)?.[1].body).toContain('2 alerte(s) secteur');
  });

  it('does not touch alerts when another run already expired the row', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    await run();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('is idempotent: a row another run already expired is not hidden or notified again', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const r = await run();
    expect(r.expired).toBe(0);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('selection queries', () => {
  it('selects GRACE only past the 7-day window and CANCELED past the period end, oldest first', async () => {
    await run();
    const calls = prismaMock.subscription.findMany.mock.calls;
    expect(calls).toHaveLength(5);
    expect(calls[2]?.[0]).toMatchObject({
      where: {
        planKey: { not: 'FREE' },
        OR: [
          { status: 'GRACE', currentPeriodEnd: { lte: new Date(now.getTime() - GRACE_PERIOD_MS) } },
          { status: 'CANCELED', currentPeriodEnd: { lte: now } },
        ],
      },
    });
    // a GRACE row ending 3 days ago is inside the window: its end is after the cutoff
    expect(at(-3).getTime()).toBeGreaterThan(now.getTime() - GRACE_PERIOD_MS);
    for (const call of calls) {
      expect(call[0]).toMatchObject({ orderBy: { currentPeriodEnd: 'asc' } });
    }
  });
});

describe('robustness', () => {
  it('does nothing when there are no subscriptions (including null period ends)', async () => {
    expect(await run()).toEqual({ reminded: 0, graced: 0, expired: 0, hidden: 0, trialEnded: 0 });
  });

  it('keeps processing the other users when one fails', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        { userId: 'bad', currentPeriodEnd: at(2) },
        { userId: 'ok', currentPeriodEnd: at(2) },
      ] as never)
      .mockResolvedValue([]);
    mockNotify.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({} as never);
    expect((await run()).reminded).toBe(1);
  });
});

describe('trial', () => {
  // Answers the two trial queries like the database would: the reminder one
  // (end in (now, now+3d]) and the elapsed one (end <= now).
  const trialRows = (rows: { userId: string; currentPeriodEnd: Date }[]) =>
    prismaMock.subscription.findMany.mockImplementation((async (a: {
      where: { status?: unknown; currentPeriodEnd?: { gt?: Date; lte?: Date } };
    }) => {
      if (a.where.status !== 'TRIAL') return [];
      const range = a.where.currentPeriodEnd ?? {};
      return rows.filter((r) => {
        const t = r.currentPeriodEnd.getTime();
        return (
          (range.gt ? t > range.gt.getTime() : true) &&
          (range.lte ? t <= range.lte.getTime() : true)
        );
      });
    }) as never);

  it('reminds a trial ending within 3 days, once per trial', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(2) }]);
    const r = await run();
    expect(r.reminded).toBe(1);
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toContain(
      `trial-reminder:a:${at(2).toISOString()}`,
    );
  });

  it('asks only for trials ending within 3 days for the reminder', async () => {
    trialRows([]);
    await run();
    const wheres = prismaMock.subscription.findMany.mock.calls
      .map((c) => c[0]!.where as Record<string, unknown>)
      .filter((w) => w.status === 'TRIAL');
    expect(
      wheres.some(
        (w) => JSON.stringify(w.currentPeriodEnd) === JSON.stringify({ gt: now, lte: at(3) }),
      ),
    ).toBe(true);
  });

  it('ends an elapsed trial: FREE/EXPIRED, excess listings and alerts removed, notified', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-0.5) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(4);
    mockDisable.mockResolvedValue(6);
    const r = await run();
    expect(r.trialEnded).toBe(1);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'a', status: 'TRIAL', currentPeriodEnd: { lte: now } },
      data: { planKey: 'FREE', status: 'EXPIRED' },
    });
    expect(mockHide).toHaveBeenCalledWith(expect.anything(), 'a', 5);
    expect(mockDisable).toHaveBeenCalledWith(expect.anything(), 'a', DEFAULT_PRICING, 'FREE');
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toContain(
      `trial-ended:a:${at(-0.5).toISOString()}`,
    );
  });

  it('is idempotent: a trial already ended by another run changes nothing', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-1) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const r = await run();
    expect(r.trialEnded).toBe(0);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('takes the listing lock before the alert lock', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-1) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    await run();
    expect(mockLock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      mockAlertLock.mock.invocationCallOrder.at(-1)!,
    );
  });
});
