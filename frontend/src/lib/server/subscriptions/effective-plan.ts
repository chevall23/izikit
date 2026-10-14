// What plan does this user effectively have RIGHT NOW? Derived from the row
// and the clock, so quotas are correct even if the lifecycle cron is late.
import 'server-only';
import { isPlanKey, type PlanKey } from '@/lib/subscription-plans';

export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  planKey: string;
  status: string;
  currentPeriodEnd: Date | null;
}

export function getEffectivePlanKey(sub: SubscriptionLike | null, now: Date): PlanKey {
  if (!sub || !isPlanKey(sub.planKey) || sub.planKey === 'FREE') return 'FREE';
  if (sub.status === 'EXPIRED') return 'FREE';
  // A trial has a hard end: no grace window, and no end date means no trial.
  if (sub.status === 'TRIAL') {
    return sub.currentPeriodEnd && now.getTime() <= sub.currentPeriodEnd.getTime()
      ? sub.planKey
      : 'FREE';
  }
  const end = sub.currentPeriodEnd;
  if (!end) return sub.planKey; // no period (manual grant): never lapses by itself
  if (sub.status === 'CANCELED') return now.getTime() <= end.getTime() ? sub.planKey : 'FREE';
  // ACTIVE | GRACE: paid period + grace window
  return now.getTime() <= end.getTime() + GRACE_PERIOD_MS ? sub.planKey : 'FREE';
}
