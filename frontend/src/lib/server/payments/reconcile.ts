// Safety net for lost SasPay webhooks. SasPay retries a webhook 5 times over
// ~2h; past that a paid session would stay PENDING (then EXPIRED) forever and
// the customer would be debited without being credited. This asks SasPay for
// the authoritative state of recent saspay orders and applies the same guarded
// transition the webhook does (markOrderPaid is a conditional update, so a
// webhook and a reconcile racing on one order fulfil it once).
//
// Called by the order-expiration cron (every 5 min) and by the order success
// page for the order the customer just paid.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import type { PrismaTransactionClient } from '../webhook/handler';
import { getSaspayHandle } from '../webhook/saspay';
import { markOrderPaid } from './order-transitions';

const log = createLogger();

const MIN_AGE_MS = 5 * 60 * 1000; // give the webhook time to arrive first
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const DEFAULT_BATCH = 25;

export type ReconcileOutcome = 'paid' | 'still-pending' | 'skipped' | 'error';

async function reconcileOne(
  prisma: PrismaClient,
  order: { id: string; providerChargeId: string | null },
): Promise<ReconcileOutcome> {
  if (!order.providerChargeId) return 'skipped';
  const saspay = getSaspayHandle();
  const session = await saspay.getCheckoutStatus(order.providerChargeId);
  if (session.status !== 'PAID' || !session.transactionId) return 'still-pending';

  // The session says paid: confirm on the transaction itself (amount/currency).
  const tx = await saspay.verifyPayment(session.transactionId);
  if (tx.status !== 'PAID') return 'still-pending';

  const moved = await prisma.$transaction(
    async (db) => {
      const fresh = await db.order.findUnique({ where: { id: order.id } });
      if (!fresh) return false;
      const comparable = !tx.currency || tx.currency === fresh.currency;
      return markOrderPaid(db as unknown as PrismaTransactionClient, fresh, {
        paidAmount: comparable ? tx.amount : undefined,
      });
    },
    { isolationLevel: 'Serializable' },
  );
  if (moved) log.info('[reconcile] order recovered from SasPay', { orderId: order.id });
  return moved ? 'paid' : 'skipped';
}

/** Reconciles one order (success page). Never throws. */
export async function reconcileOrder(prisma: PrismaClient, orderId: string): Promise<void> {
  try {
    if (!process.env.SASPAY_SECRET_KEY) return;
    const order = await prisma.order.findFirst({
      where: { id: orderId, provider: 'saspay', status: { in: ['PENDING', 'FAILED', 'EXPIRED'] } },
      select: { id: true, providerChargeId: true },
    });
    if (order) await reconcileOne(prisma, order);
  } catch (err) {
    log.warn('[reconcile] single order failed', { orderId, err: String(err) });
  }
}

/** Reconciles recent unsettled saspay orders (cron). Never throws. */
export async function reconcileSaspayOrders(
  prisma: PrismaClient,
  now: Date = new Date(),
  limit: number = DEFAULT_BATCH,
): Promise<{ checked: number; recovered: number }> {
  if (!process.env.SASPAY_SECRET_KEY) return { checked: 0, recovered: 0 };
  const candidates = await prisma.order.findMany({
    where: {
      provider: 'saspay',
      status: { in: ['PENDING', 'FAILED', 'EXPIRED'] },
      providerChargeId: { not: null },
      createdAt: {
        lte: new Date(now.getTime() - MIN_AGE_MS),
        gte: new Date(now.getTime() - MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, providerChargeId: true },
  });

  let recovered = 0;
  for (const order of candidates) {
    try {
      if ((await reconcileOne(prisma, order)) === 'paid') recovered++;
    } catch (err) {
      log.warn('[reconcile] order check failed', { orderId: order.id, err: String(err) });
    }
  }
  return { checked: candidates.length, recovered };
}
