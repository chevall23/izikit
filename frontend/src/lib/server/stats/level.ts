// What /statistiques shows and allows, by the user's EFFECTIVE plan (trial,
// grace and expiry included — derived from the clock, not from the cron).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { PLAN_CATALOG, type StatsLevel } from '@/lib/subscription-plans';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

const BASIC_PERIODS = ['7j', '30j'];
const BASIC_LOCKED = ['viewsTimeseries', 'topListings', 'trafficSources'];

export async function getStatsLevel(
  db: Pick<PrismaClient, 'subscription'>,
  userId: string,
  now: Date = new Date(),
): Promise<StatsLevel> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  return PLAN_CATALOG[getEffectivePlanKey(sub, now)].statsLevel;
}

export function periodAllowed(level: StatsLevel, period: string): boolean {
  return level !== 'BASIC' || BASIC_PERIODS.includes(period);
}

export function canExport(level: StatsLevel): boolean {
  return level === 'ADVANCED';
}

export function lockedBlocks(level: StatsLevel): string[] {
  return level === 'BASIC' ? [...BASIC_LOCKED] : [];
}
