// One call to tell a user about something: an in-app notification (bell) and,
// when the event warrants it, an e-mail — so people who are not logged in
// still find out (subscription expiring, listing refused, withdrawal
// cancelled…). The e-mail honours the user's per-event preference
// (Paramètres → Notifications, opt-out model: no override = enabled).
//
// Best-effort by design: it never throws, so a notification problem cannot
// fail the action that triggered it. The notification's deterministic
// dedupeKey also gates the e-mail — a replayed event sends nothing twice.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import { createNotification, type CreateNotificationInput } from './index';
import { isChannelEnabled, type NotificationPrefs } from './prefs-merge';
import { getEmailQueue } from '../queues/email-queue-singleton';
import type { EmailContent } from '../emails/layout';

const log = createLogger();

/** Builds the e-mail once the recipient's first name is known. */
export type EmailBuilder = (recipient: { firstName: string }) => EmailContent;

export async function notifyUser(
  prisma: PrismaClient,
  input: CreateNotificationInput,
  email?: EmailBuilder,
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, notifPrefs: { select: { prefs: true } } },
    });
    if (!user) return false;
    const prefs = (user.notifPrefs?.prefs ?? null) as NotificationPrefs | null;

    let created = false;
    if (isChannelEnabled(prefs, input.type, 'inApp')) {
      created = (await createNotification(prisma, input)) !== null;
    }

    // `created` is false for a duplicate (already told) or an opted-out bell.
    // For the duplicate we must not mail again; for an opted-out bell the
    // dedupe key was never consumed, so only send the e-mail when it was.
    if (!email || !user.email || !isChannelEnabled(prefs, input.type, 'email')) return created;
    if (!created && isChannelEnabled(prefs, input.type, 'inApp')) return false;

    const queue = getEmailQueue();
    if (!queue) return created;
    const firstName = (user.name ?? '').trim().split(/\s+/)[0] ?? '';
    await queue.enqueue({ to: user.email, ...email({ firstName }) });
    void queue.drainOne().catch((err) => {
      log.warn('notify-user: immediate email drain failed (cron will retry)', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
    return true;
  } catch (err) {
    log.warn('notify-user failed', {
      userId: input.userId,
      type: input.type,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
