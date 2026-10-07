// Guarded Order status transitions for the payment webhooks (Bictorys,
// Moneroo, …). Webhook dedup is keyed on (externalId, eventType), so two
// "paid" events of different types for the same charge both reach onPaid —
// every transition is therefore a conditional `updateMany` on the current
// status, and side effects only run when this call actually moved the row:
//   - PAID is reached at most once (fulfillment never runs twice); a late
//     payment on an EXPIRED / FAILED order is still honored.
//   - FAILED only replaces PENDING (a late failure never downgrades PAID).
//   - REFUNDED only replaces PAID.
// Runs inside the webhook factory's Serializable transaction.
import 'server-only';
import type { PrismaTransactionClient } from '../webhook/handler';
import { createLogger } from '../logger';
import { fulfillPaidOrder, type FulfillableOrder } from './fulfill-order';

const log = createLogger();

const PAYABLE_STATUSES = ['PENDING', 'EXPIRED', 'FAILED'];

/** Reads a provider amount field, `undefined` when absent or not a number. */
export function readAmount(raw: unknown): number | undefined {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * Marks the order PAID and fulfills it. Refuses (returns false) when the
 * provider reports an amount different from the order's, or when the order
 * was already PAID / REFUNDED.
 */
export async function markOrderPaid(
  tx: PrismaTransactionClient,
  order: FulfillableOrder,
  opts: { paidAmount?: number | undefined; paymentMethod?: string | null } = {},
): Promise<boolean> {
  if (opts.paidAmount !== undefined && opts.paidAmount !== order.amount) {
    log.error('[order-transitions] webhook amount does not match the order — not marking PAID', {
      orderId: order.id,
      expected: order.amount,
      received: opts.paidAmount,
    });
    return false;
  }

  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: { in: PAYABLE_STATUSES } },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      ...(opts.paymentMethod ? { paymentMethod: opts.paymentMethod } : {}),
    },
  });
  if (count === 0) {
    log.warn(
      '[order-transitions] order not payable (already PAID / REFUNDED) — skipping fulfillment',
      {
        orderId: order.id,
      },
    );
    return false;
  }

  await fulfillPaidOrder(tx, order);
  return true;
}

export async function markOrderFailed(tx: PrismaTransactionClient, orderId: string): Promise<void> {
  await tx.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}

export async function markOrderRefunded(
  tx: PrismaTransactionClient,
  orderId: string,
): Promise<void> {
  await tx.order.updateMany({
    where: { id: orderId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  });
}
