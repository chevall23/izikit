// Listing quota per effective plan + the hide/restore helpers shared by the
// lifecycle cron, the voluntary downgrade route and the renewal webhook.
// HIDDEN = hidden because the subscription lapsed; never deleted, and only
// VERIFIED listings are ever hidden (PENDING ones are not public anyway).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxListings, type PricingData } from '@/lib/pricing';
import type { PlanKey } from '@/lib/subscription-plans';
import type { TxClient } from '../withdrawals/lock';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

export const PUBLISHED_STATUSES = ['VERIFIED', 'PENDING'] as const;

/**
 * Per-user transaction-scoped advisory lock (same pattern as
 * withdrawals/lock.ts, distinct key namespace). Run the quota check and the
 * publishing write inside the same transaction after taking it.
 */
export async function lockUserListingQuota(tx: TxClient, userId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `listing-quota:${userId}`,
  );
}

type ListingDb = Pick<PrismaClient, 'listing'>;

export interface QuotaCheck {
  allowed: boolean;
  planKey: PlanKey;
  limit: number | null;
  used: number;
}

export async function checkListingQuota(
  db: Pick<PrismaClient, 'subscription' | 'listing'>,
  userId: string,
  pricing: PricingData,
  opts: { now?: Date; excludeListingId?: string } = {},
): Promise<QuotaCheck> {
  const now = opts.now ?? new Date();
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  const planKey = getEffectivePlanKey(sub, now);
  const limit = planMaxListings(pricing, planKey);
  if (limit === null) return { allowed: true, planKey, limit, used: 0 };

  const used = await db.listing.count({
    where: {
      userId,
      status: { in: [...PUBLISHED_STATUSES] },
      ...(opts.excludeListingId ? { id: { not: opts.excludeListingId } } : {}),
    },
  });
  return { allowed: used < limit, planKey, limit, used };
}

export async function hideExcessListings(
  db: ListingDb,
  userId: string,
  limit: number | null,
): Promise<number> {
  if (limit === null) return 0;
  const published = await db.listing.findMany({
    where: { userId, status: { in: [...PUBLISHED_STATUSES] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true },
  });
  const toHide = published
    .slice(limit)
    .filter((l) => l.status === 'VERIFIED')
    .map((l) => l.id);
  if (toHide.length === 0) return 0;
  const res = await db.listing.updateMany({
    where: { id: { in: toHide }, status: 'VERIFIED' },
    data: { status: 'HIDDEN' },
  });
  return res.count;
}

export async function reactivateHiddenListings(
  db: ListingDb,
  userId: string,
  limit: number | null,
): Promise<number> {
  const used = await db.listing.count({
    where: { userId, status: { in: [...PUBLISHED_STATUSES] } },
  });
  const slots = limit === null ? 1000 : Math.min(1000, Math.max(0, limit - used));
  if (slots === 0) return 0;
  const hidden = await db.listing.findMany({
    where: { userId, status: 'HIDDEN' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: slots,
    select: { id: true },
  });
  if (hidden.length === 0) return 0;
  const res = await db.listing.updateMany({
    where: { id: { in: hidden.map((l) => l.id) }, status: 'HIDDEN' },
    data: { status: 'VERIFIED' },
  });
  return res.count;
}
