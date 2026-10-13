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
import { getPricing } from '../pricing';
import { lockUserListingQuota, reactivateHiddenListings } from '../listings/quota';
import { planMaxListings } from '@/lib/pricing';
import { isPlanKey } from '@/lib/subscription-plans';
import { TOKEN_PACK_CATALOG, isTokenPackKey } from '@/lib/token-packs';

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

  if (order.userId && meta?.kind === 'subscription_plan_change' && isPlanKey(meta.planKey)) {
    const now = Date.now();
    const existing = await tx.subscription.findUnique({
      where: { userId: order.userId },
      select: { planKey: true, status: true, currentPeriodEnd: true },
    });
    // Renewing the SAME plan while it is still running carries the remaining
    // days over; any other case (upgrade, lapsed, grace) starts from now, so
    // switching plans never gifts time at the higher tier.
    const carryFrom =
      existing !== null &&
      existing.planKey === meta.planKey &&
      (existing.status === 'ACTIVE' || existing.status === 'CANCELED') &&
      existing.currentPeriodEnd !== null &&
      existing.currentPeriodEnd.getTime() > now
        ? existing.currentPeriodEnd.getTime()
        : now;
    const currentPeriodEnd = new Date(carryFrom + SUBSCRIPTION_PERIOD_MS);

    await tx.subscription.upsert({
      where: { userId: order.userId },
      create: { userId: order.userId, planKey: meta.planKey, status: 'ACTIVE', currentPeriodEnd },
      update: { planKey: meta.planKey, status: 'ACTIVE', currentPeriodEnd, canceledAt: null },
    });

    // Bring back listings hidden by a previous expiry, within the new quota.
    // The per-user lock serialises this with a concurrent publish.
    await lockUserListingQuota(tx, order.userId);
    await reactivateHiddenListings(
      tx,
      order.userId,
      planMaxListings(await getPricing(), meta.planKey),
    );
  }

  if (order.userId && meta?.kind === 'token_purchase' && isTokenPackKey(meta.packKey)) {
    const pack = TOKEN_PACK_CATALOG[meta.packKey];
    // Prefer the count frozen at order creation (server-computed) over the
    // code default, so a later price/pack edit never changes what was paid for.
    // Only trust it when the server's freeze marker is present (priceFcfa ===
    // order.amount); orders created before the freeze may carry client-supplied
    // `tokens`, so they fall back to the catalog default.
    const frozen = typeof meta.priceFcfa === 'number' && meta.priceFcfa === order.amount;
    const tokens =
      frozen && typeof meta.tokens === 'number' && Number.isInteger(meta.tokens) && meta.tokens > 0
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
    await creditTokenWallet(
      tx,
      order.userId,
      meta.tokens,
      `Achat personnalisé de ${meta.tokens} jeton${meta.tokens > 1 ? 's' : ''}`,
      order.id,
    );
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
