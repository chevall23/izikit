/**
 * POST /api/webhooks/saspay — SasPay payment webhook adapter.
 *
 * Thin shim over the battle-tested factory at `lib/server/webhook/handler.ts`
 * (PROTECTED — never modified). Mirrors `webhooks/moneroo/route.ts` — same
 * factory, same `markOrderPaid` / `fulfillPaidOrder` shared side-effects,
 * different provider.
 *
 * CLAUDE.md invariants honored here:
 *   - runtime = 'nodejs' is exported below (Buffer/crypto + Prisma — the
 *     runtime-enforcement test fails CI otherwise).
 *   - dynamic = 'force-dynamic' is exported below (prevents accidental POST
 *     caching by Next.js).
 *   - This file NEVER reads the request body. The factory itself reads the
 *     raw bytes for byte-identical HMAC verification.
 *   - Side-effects run inside the factory's Serializable tx via
 *     `markOrderPaid` → `fulfillPaidOrder`, which uses enqueueOutbox(tx, ...)
 *     — never after-commit closures (D-04 outbox-not-closures invariant).
 *
 * Correlation: the webhook carries the *transaction* id, while
 * `Order.providerChargeId` holds the checkout *session* id. An order is found
 * through, in order: `data.metadata.orderId` (we send it at session creation),
 * `providerChargeId === data.id`, then a lookup of the PAID checkout sessions
 * (`resolveCheckoutSessionId`). The same webhook also reports payout
 * transactions — those match a `Withdrawal.providerPayoutId`.
 *
 * A transaction matching nothing throws → 500 → SasPay retries (5 attempts
 * over ~2h) instead of silently dropping a payment we could not attribute yet.
 *
 * SasPay has no refund event, so there is no `onRefunded`; `cancelled` and
 * `failed` both map to `kind: 'failed'` in the adapter.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler, type PrismaTransactionClient } from '@/lib/server/webhook/handler';
import {
  getSaspayHandle,
  saspayWebhookProvider,
  type SaspayWebhookPayload,
} from '@/lib/server/webhook/saspay';
import { paymentMethodFromNetwork } from '@/lib/server/payments/saspay';
import {
  markOrderFailed,
  markOrderPaid,
  readAmount,
} from '@/lib/server/payments/order-transitions';
import { prisma } from '@/lib/server/prisma';

type SaspayData = NonNullable<SaspayWebhookPayload['data']>;

async function findOrder(tx: PrismaTransactionClient, data: SaspayData) {
  const transactionId = String(data.id ?? '');

  const metaOrderId = data.metadata?.orderId;
  if (typeof metaOrderId === 'string' && metaOrderId) {
    const byMeta = await tx.order.findFirst({ where: { id: metaOrderId, provider: 'saspay' } });
    if (byMeta) return byMeta;
  }

  const direct = await tx.order.findFirst({ where: { providerChargeId: transactionId } });
  if (direct) return direct;

  const sessionId = await getSaspayHandle().resolveCheckoutSessionId(transactionId);
  if (!sessionId) return null;
  return tx.order.findFirst({ where: { providerChargeId: sessionId } });
}

export const POST = createWebhookHandler({
  prisma,
  provider: saspayWebhookProvider,

  async onPaid(payload, tx) {
    const data = payload.data;
    const transactionId = String(data?.id ?? '');
    if (!data || !transactionId) return {}; // no id to correlate

    const order = await findOrder(tx, data);
    if (order) {
      // `amount` is the requested amount (what the order was priced at), not
      // what the payer was charged. Card/crypto sessions are settled in USD,
      // so the amount is only comparable when the currency matches the order.
      const comparable = !data.currency || data.currency === order.currency;
      await markOrderPaid(tx, order, {
        paidAmount: comparable ? readAmount(data.amount) : undefined,
        paymentMethod: paymentMethodFromNetwork(data.network),
      });
      return {};
    }

    // Payout confirmation: the transaction id is the payout id.
    const withdrawal = await tx.withdrawal.findFirst({
      where: { providerPayoutId: transactionId },
    });
    if (withdrawal) {
      await tx.withdrawal.updateMany({
        where: { id: withdrawal.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return {};
    }

    throw new Error(`[saspay] transaction ${transactionId} matches no order or withdrawal`);
  },

  async onFailed(payload, tx) {
    const data = payload.data;
    const transactionId = String(data?.id ?? '');
    if (!data || !transactionId) return {};

    const order = await findOrder(tx, data);
    if (order) {
      await markOrderFailed(tx, order.id);
      return {};
    }

    const withdrawal = await tx.withdrawal.findFirst({
      where: { providerPayoutId: transactionId },
    });
    if (withdrawal) {
      await tx.withdrawal.updateMany({
        where: { id: withdrawal.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason: String(data.status ?? 'FAILED') },
      });
      return {};
    }

    // A failed payment that never reached an order is harmless — acknowledge.
    return {};
  },
});
