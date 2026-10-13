// Subscription lifecycle, driven by the hourly cron. State-based and
// idempotent: every transition is a guarded updateMany and every notification
// is deduplicated, so a re-run (or two overlapping ones) changes nothing twice.
//   ACTIVE ──(period end)──► GRACE ──(+7 d)──► EXPIRED (plan FREE, excess hidden)
//   CANCELED ──(period end)──► EXPIRED (no grace: the user chose to leave)
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxListings, type PricingData } from '@/lib/pricing';
import { createLogger } from '@/lib/server/logger';
import { hideExcessListings } from '../listings/quota';
import { createNotification } from '../notifications';
import {
  subscriptionExpiredNotification,
  subscriptionGraceNotification,
  subscriptionReminderNotification,
} from '../notifications/templates';
import { GRACE_PERIOD_MS } from './effective-plan';

const log = createLogger();
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

export interface LifecycleResult {
  reminded: number;
  graced: number;
  expired: number;
  hidden: number;
}

export async function runSubscriptionLifecycle(opts: {
  prisma: PrismaClient;
  pricing: PricingData;
  now?: Date;
}): Promise<LifecycleResult> {
  const { prisma, pricing } = opts;
  const now = opts.now ?? new Date();
  const result: LifecycleResult = { reminded: 0, graced: 0, expired: 0, hidden: 0 };

  // 1. Reminders (J-7, then J-3) for ACTIVE subscriptions ending within a week.
  const upcoming = await prisma.subscription.findMany({
    where: {
      planKey: { not: 'FREE' },
      status: 'ACTIVE',
      currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
    },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  for (const sub of upcoming) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const daysLeft: 7 | 3 = (end.getTime() - now.getTime()) / DAY_MS <= 3 ? 3 : 7;
      const created = await createNotification(
        prisma,
        subscriptionReminderNotification(sub.userId, daysLeft, end),
      );
      if (created) result.reminded++;
    } catch (err) {
      log.warn('subscription reminder failed', { userId: sub.userId, error: String(err) });
    }
  }

  // 2. ACTIVE past the period end → GRACE.
  const lapsed = await prisma.subscription.findMany({
    where: { planKey: { not: 'FREE' }, status: 'ACTIVE', currentPeriodEnd: { lte: now } },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  for (const sub of lapsed) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const moved = await prisma.subscription.updateMany({
        where: { userId: sub.userId, status: 'ACTIVE' },
        data: { status: 'GRACE' },
      });
      if (moved.count > 0) {
        await createNotification(prisma, subscriptionGraceNotification(sub.userId, end));
        result.graced++;
      }
    } catch (err) {
      log.warn('subscription grace transition failed', { userId: sub.userId, error: String(err) });
    }
  }

  // 3. GRACE past the window, or CANCELED past the period end → EXPIRED + hide.
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);
  const toExpire = await prisma.subscription.findMany({
    where: {
      planKey: { not: 'FREE' },
      OR: [
        { status: 'GRACE', currentPeriodEnd: { lte: graceCutoff } },
        { status: 'CANCELED', currentPeriodEnd: { lte: now } },
      ],
    },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  const freeLimit = planMaxListings(pricing, 'FREE');
  for (const sub of toExpire) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const moved = await tx.subscription.updateMany({
          where: {
            userId: sub.userId,
            planKey: { not: 'FREE' },
            status: { in: ['GRACE', 'CANCELED'] },
          },
          data: { planKey: 'FREE', status: 'EXPIRED' },
        });
        if (moved.count === 0) return null;
        return { hidden: await hideExcessListings(tx, sub.userId, freeLimit) };
      });
      if (outcome) {
        await createNotification(
          prisma,
          subscriptionExpiredNotification(sub.userId, outcome.hidden, end),
        );
        result.expired++;
        result.hidden += outcome.hidden;
      }
    } catch (err) {
      log.warn('subscription expiry failed', { userId: sub.userId, error: String(err) });
    }
  }

  return result;
}
