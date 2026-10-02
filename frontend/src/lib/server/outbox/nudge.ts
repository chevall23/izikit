/**
 * Best-effort immediate delivery for events a route just wrote to the outbox.
 *
 * An outbox email otherwise waits for TWO crons in sequence (outbox-drain →
 * EmailJob, then email-queue-drain → Brevo), both every 5 min on N0C — up to
 * ~10 min for a verification / password-reset code that is only valid 15 min.
 *
 * Call it AFTER the transaction commits and do NOT await it (`void
 * nudgeOutbox('…')`), so the response — and the forgot-password timing floor
 * — never depends on it. It goes through the same per-row atomic claims as
 * the crons, so a concurrent cron run cannot double-send. Never throws: a
 * failure is logged and the crons remain the durable retry path.
 */
import 'server-only';
import { drainOutbox } from './dispatcher';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { prisma } from '../prisma';
import { log } from '../observability/log';

const BATCH_SIZE = 10;

export async function nudgeOutbox(reason: string): Promise<void> {
  try {
    const queue = getEmailQueue();
    await drainOutbox({ prisma, ...(queue ? { emailQueue: queue } : {}) }, BATCH_SIZE);
    if (!queue) return;
    for (let i = 0; i < BATCH_SIZE; i++) {
      if (!(await queue.drainOne())) break;
    }
  } catch (err) {
    log.warn('outbox nudge failed (cron will retry)', {
      reason,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
