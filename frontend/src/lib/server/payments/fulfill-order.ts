// Provider-agnostic order fulfillment — called from each payment provider's
// webhook onPaid handler (Bictorys, Moneroo, …) once the Order row has been
// marked PAID. Kept separate from any single provider so the subscription
// activation / token wallet crediting logic never drifts between providers.
//
// Runs INSIDE the webhook factory's Serializable transaction (see
// webhook/handler.ts, PROTECTED) — the caller passes its `tx` through.
import 'server-only';
import type { PrismaTransactionClient } from '../webhook/handler';
import { enqueueOutbox } from '../outbox';
import { readStoredPricing } from '../pricing';
import { createLogger } from '../logger';
import {
  hideExcessListings,
  lockUserListingQuota,
  reactivateHiddenListings,
} from '../listings/quota';
import { disableExcessAlerts, lockUserAlertQuota } from '../alerts/quota';
import {
  planIncludedBoosts,
  planMaxListings,
  planMonthlyTokens,
  type PricingData,
} from '@/lib/pricing';
import { isPlanKey, PLAN_CATALOG, type PlanKey } from '@/lib/subscription-plans';
import { TOKEN_PACK_CATALOG, isTokenPackKey } from '@/lib/token-packs';

const log = createLogger();

const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

async function creditTokenWallet(
  tx: PrismaTransactionClient,
  userId: string,
  tokens: number,
  description: string,
  orderId: string,
): Promise<void> {
  const wallet = await tx.tokenWallet.upsert({
    where: { userId },
    create: { userId, balance: tokens },
    update: { balance: { increment: tokens } },
  });
  await tx.tokenTransaction.create({
    data: {
      userId,
      type: 'PURCHASE',
      amount: tokens,
      balanceAfter: wallet.balance,
      description,
      orderId,
    },
  });
}

export interface FulfillableOrder {
  id: string;
  userId: string | null;
  customerEmail: string | null;
  amount: number;
  currency: string;
  metadata?: unknown;
}

/**
 * Applies the side effects of a confirmed payment: subscription-plan
 * activation, token-wallet crediting, and outbox notification/email
 * events. Does NOT touch `Order.status` — the caller's onPaid handler
 * updates that itself (its externalRef-matching lookup already has the
 * row).
 */
export async function fulfillPaidOrder(
  tx: PrismaTransactionClient,
  order: FulfillableOrder,
): Promise<void> {
  const meta = (order.metadata ?? null) as {
    kind?: unknown;
    planKey?: unknown;
    packKey?: unknown;
    tokens?: unknown;
    priceFcfa?: unknown;
  } | null;

  // Server freeze marker: orders created after the server-side price check carry
  // `priceFcfa === amount`. Legacy orders may hold client-forged amounts, so the
  // priced grants below are refused without it. Never throw (the provider would
  // retry forever): log and skip the grant.
  const priceFrozen = typeof meta?.priceFcfa === 'number' && meta.priceFcfa === order.amount;

  if (order.userId && meta?.kind === 'subscription_plan_change' && isPlanKey(meta.planKey)) {
    if (!priceFrozen) {
      log.error('Refusing subscription grant: order has no valid price freeze marker', {
        orderId: order.id,
      });
    } else {
      await grantSubscription(tx, order.userId, meta.planKey, order.id);
    }
  }

  if (order.userId && meta?.kind === 'token_purchase' && isTokenPackKey(meta.packKey)) {
    const pack = TOKEN_PACK_CATALOG[meta.packKey];
    // Prefer the count frozen at order creation (server-computed) over the
    // code default, so a later price/pack edit never changes what was paid for.
    // Only trust it when the freeze marker is present; legacy orders may carry
    // client-supplied `tokens`, so they fall back to the catalog default.
    const tokens =
      priceFrozen &&
      typeof meta.tokens === 'number' &&
      Number.isInteger(meta.tokens) &&
      meta.tokens > 0
        ? meta.tokens
        : pack.tokens;
    await creditTokenWallet(tx, order.userId, tokens, `Achat pack ${pack.label}`, order.id);
  }

  if (
    order.userId &&
    meta?.kind === 'token_purchase_custom' &&
    typeof meta.tokens === 'number' &&
    Number.isInteger(meta.tokens) &&
    meta.tokens > 0
  ) {
    if (!priceFrozen) {
      log.error('Refusing custom token credit: order has no valid price freeze marker', {
        orderId: order.id,
      });
    } else {
      await creditTokenWallet(
        tx,
        order.userId,
        meta.tokens,
        `Achat personnalisé de ${meta.tokens} jeton${meta.tokens > 1 ? 's' : ''}`,
        order.id,
      );
    }
  }

  if (order.userId) {
    await enqueueOutbox(tx, {
      kind: 'notification.payment_received',
      payload: {
        userId: order.userId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
    });
  }
  if (order.customerEmail) {
    await enqueueOutbox(tx, {
      kind: 'email.payment_confirmation',
      payload: {
        to: order.customerEmail,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
    });
  }
}

// Perks included in the plan (monthly tokens + boosts). One grant per paid
// period: the key is the order, so a replayed delivery cannot credit twice (the
// findUnique guards the transaction; the unique column is the backstop). A
// unique violation inside this Serializable tx would abort it, hence the
// read-first. The BONUS row is written whenever the plan grants anything, even
// at 0 tokens, so it also keys the boost credit.
async function grantPlanPerks(
  tx: PrismaTransactionClient,
  userId: string,
  planKey: PlanKey,
  orderId: string,
  pricing: PricingData,
): Promise<void> {
  const tokens = planMonthlyTokens(pricing, planKey);
  const boosts = planIncludedBoosts(pricing, planKey);
  if (tokens <= 0 && boosts <= 0) return;
  const grantKey = `plan:${orderId}`;
  const done = await tx.tokenTransaction.findUnique({ where: { grantKey }, select: { id: true } });
  if (done) return;
  const wallet = await tx.tokenWallet.upsert({
    where: { userId },
    create: { userId, balance: tokens },
    update: { balance: { increment: tokens } },
  });
  const label = PLAN_CATALOG[planKey].label;
  const description =
    tokens > 0 && boosts > 0
      ? `Jetons et boosts offerts — plan ${label}`
      : tokens > 0
        ? `Jetons offerts — plan ${label}`
        : `Boosts offerts — plan ${label}`;
  await tx.tokenTransaction.create({
    data: {
      userId,
      type: 'BONUS',
      amount: tokens,
      balanceAfter: wallet.balance,
      description,
      grantKey,
    },
  });
  if (boosts > 0) {
    await tx.subscription.update({
      where: { userId },
      data: { boostCredits: { increment: boosts } },
    });
  }
}

async function grantSubscription(
  tx: PrismaTransactionClient,
  userId: string,
  planKey: PlanKey,
  orderId: string,
): Promise<void> {
  // Lock first (same lock-then-write order as lifecycle expiry and change-plan);
  // it also serialises this grant with a concurrent publish.
  await lockUserListingQuota(tx, userId);
  const now = Date.now();
  const existing = await tx.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  // Renewing the SAME plan while it is still running carries the remaining
  // days over; any other case (upgrade, lapsed, grace) starts from now, so
  // switching plans never gifts time at the higher tier.
  const carryFrom =
    existing !== null &&
    existing.planKey === planKey &&
    (existing.status === 'ACTIVE' || existing.status === 'CANCELED') &&
    existing.currentPeriodEnd !== null &&
    existing.currentPeriodEnd.getTime() > now
      ? existing.currentPeriodEnd.getTime()
      : now;
  const currentPeriodEnd = new Date(carryFrom + SUBSCRIPTION_PERIOD_MS);

  await tx.subscription.upsert({
    where: { userId },
    create: { userId, planKey, status: 'ACTIVE', currentPeriodEnd },
    update: { planKey, status: 'ACTIVE', currentPeriodEnd, canceledAt: null },
  });

  const pricing = await readStoredPricing(tx);
  // Bring back listings hidden by a previous expiry, within the new quota.
  await reactivateHiddenListings(tx, userId, planMaxListings(pricing, planKey));
  // Paying for a SMALLER plan than the one in force (e.g. Agence → Pro) must
  // bring listings and alerts back within the new quotas, like an expiry does.
  // Listing lock first, alert lock second (fixed order, no deadlock).
  await hideExcessListings(tx, userId, planMaxListings(pricing, planKey));
  await lockUserAlertQuota(tx, userId);
  await disableExcessAlerts(tx, userId, pricing, planKey);
  await grantPlanPerks(tx, userId, planKey, orderId, pricing);
}
