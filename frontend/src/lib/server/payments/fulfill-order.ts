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
  } | null;

  if (order.userId && meta?.kind === 'subscription_plan_change' && isPlanKey(meta.planKey)) {
    await tx.subscription.upsert({
      where: { userId: order.userId },
      create: {
        userId: order.userId,
        planKey: meta.planKey,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + SUBSCRIPTION_PERIOD_MS),
      },
      update: {
        planKey: meta.planKey,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + SUBSCRIPTION_PERIOD_MS),
        canceledAt: null,
      },
    });
  }

  if (order.userId && meta?.kind === 'token_purchase' && isTokenPackKey(meta.packKey)) {
    const pack = TOKEN_PACK_CATALOG[meta.packKey];
    await creditTokenWallet(tx, order.userId, pack.tokens, `Achat pack ${pack.label}`, order.id);
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
