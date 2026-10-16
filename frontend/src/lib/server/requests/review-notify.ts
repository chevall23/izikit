// Tells the admins that a new property request is waiting in /admin/demandes.
//
// Called right after the insert when the trust assessment sent the request to
// REVIEW (REJECTED bot submissions stay silent — nothing to decide). Best-effort
// by design: it never throws, so a notification problem cannot fail the
// visitor's submission.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import { createNotification } from '../notifications';
import { requestNeedsReviewNotification } from '../notifications/templates';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { requestNeedsReviewEmail } from '../emails/templates';
import { PROPERTY_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from '@/lib/listings';

const log = createLogger();

export interface ReviewRequestInfo {
  id: string;
  transactionType: string;
  propertyType: string;
  country: string;
  city: string;
}

export async function notifyAdminsOfReviewRequest(
  prisma: PrismaClient,
  request: ReviewRequestInfo,
  flags: readonly string[],
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
      select: { id: true, email: true },
    });
    if (admins.length === 0) return;

    const transactionLabel =
      TRANSACTION_TYPE_LABEL[request.transactionType] ?? request.transactionType;
    const propertyLabel = PROPERTY_TYPE_LABEL[request.propertyType] ?? request.propertyType;
    const summary = `${propertyLabel} · ${transactionLabel} · ${request.city}, ${request.country}`;

    const queue = getEmailQueue();
    for (const admin of admins) {
      try {
        const created = await createNotification(
          prisma,
          requestNeedsReviewNotification(admin.id, request.id, summary),
        );
        // A duplicate notification (null) means this admin was already told.
        if (created && queue) {
          await queue.enqueue({
            to: admin.email,
            ...requestNeedsReviewEmail({ summary, flags: [...flags] }),
          });
        }
      } catch (err) {
        log.warn('request-review: admin notify failed', {
          requestId: request.id,
          adminId: admin.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (queue) {
      void queue.drainOne().catch((err) => {
        log.warn('request-review: immediate email drain failed (cron will retry)', {
          requestId: request.id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } catch (err) {
    log.warn('request-review: admin lookup failed', {
      requestId: request.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
