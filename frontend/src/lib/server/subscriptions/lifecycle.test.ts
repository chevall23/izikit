import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/server/listings/quota', () => ({ hideExcessListings: vi.fn() }));

import { createNotification } from '@/lib/server/notifications';
import { hideExcessListings } from '@/lib/server/listings/quota';
import { runSubscriptionLifecycle } from './lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-11-10T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);
const mockNotify = vi.mocked(createNotification);
const mockHide = vi.mocked(hideExcessListings);

beforeEach(() => {
  mockNotify.mockClear();
  mockHide.mockClear();
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
      where: { userId: 'a', status: 'ACTIVE' },
      data: { status: 'GRACE' },
    });
  });

  it('skips the notification when another run already moved it', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-1) }] as never)
      .mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    expect((await run()).graced).toBe(0);
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
      where: { userId: 'a', planKey: { not: 'FREE' }, status: { in: ['GRACE', 'CANCELED'] } },
      data: { planKey: 'FREE', status: 'EXPIRED' },
    });
    expect(mockHide).toHaveBeenCalledWith(prismaMock, 'a', 3);
    expect(mockNotify.mock.calls.at(-1)?.[1]).toMatchObject({ type: 'SUBSCRIPTION_EXPIRED' });
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

describe('robustness', () => {
  it('does nothing when there are no subscriptions (including null period ends)', async () => {
    expect(await run()).toEqual({ reminded: 0, graced: 0, expired: 0, hidden: 0 });
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
