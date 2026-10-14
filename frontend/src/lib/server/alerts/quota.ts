// Sector-alert quota per effective plan. Only agent accounts (OWNER_AGENT) are
// bound by the plan; seekers keep free alerts behind a fixed anti-abuse cap.
// Excess alerts are deactivated (active = false), never deleted — same spirit
// as hiding listings (listings/quota.ts).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxAlerts, type PricingData } from '@/lib/pricing';
import type { PlanKey } from '@/lib/subscription-plans';
import type { TxClient } from '../withdrawals/lock';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

export const SEEKER_ALERT_CAP = 20;
const AGENT_ACCOUNT_TYPE = 'OWNER_AGENT';

/**
 * Per-user transaction-scoped advisory lock (distinct key namespace from the
 * listing quota). Always take lockUserListingQuota FIRST when both are needed.
 */
export async function lockUserAlertQuota(tx: TxClient, userId: string): Promise<void> {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `alert-quota:${userId}`);
}

export interface AlertQuotaCheck {
  allowed: boolean;
  planKey: PlanKey;
  limit: number | null;
  used: number;
}

export async function checkAlertQuota(
  db: Pick<PrismaClient, 'subscription' | 'alert' | 'user'>,
  userId: string,
  pricing: PricingData,
  opts: { now?: Date; excludeAlertId?: string } = {},
): Promise<AlertQuotaCheck> {
  const now = opts.now ?? new Date();
  const user = await db.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  const planKey = getEffectivePlanKey(sub, now);
  const limit =
    user?.accountType === AGENT_ACCOUNT_TYPE ? planMaxAlerts(pricing, planKey) : SEEKER_ALERT_CAP;
  if (limit === null) return { allowed: true, planKey, limit, used: 0 };

  const used = await db.alert.count({
    where: {
      userId,
      active: true,
      ...(opts.excludeAlertId ? { id: { not: opts.excludeAlertId } } : {}),
    },
  });
  return { allowed: used < limit, planKey, limit, used };
}

export async function disableExcessAlerts(
  db: Pick<PrismaClient, 'alert' | 'user'>,
  userId: string,
  pricing: PricingData,
  planKey: PlanKey,
): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  if (user?.accountType !== AGENT_ACCOUNT_TYPE) return 0;
  const limit = planMaxAlerts(pricing, planKey);
  if (limit === null) return 0;
  const active = await db.alert.findMany({
    where: { userId, active: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const excess = active.slice(limit).map((a) => a.id);
  if (excess.length === 0) return 0;
  const res = await db.alert.updateMany({
    where: { id: { in: excess }, active: true },
    data: { active: false },
  });
  return res.count;
}
