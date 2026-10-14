/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';
import { formatAmount } from '../emails/templates';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Bienvenue sur Habitat Afrik !',
    body: `Ravi de vous compter parmi nous, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Paiement reçu',
    body: `Votre paiement de ${formatAmount(amount, currency)} pour la commande ${orderId} est confirmé.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * Dispatched to an Alert's owner when a PropertyRequest matches its
 * criteria (either direction — see lib/server/alerts/matching.ts).
 */
export function alertMatchNotification(
  userId: string,
  alertId: string,
  alertName: string,
  requestId: string,
  requestSummary: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'ALERT_MATCH',
    title: `Nouvelle correspondance — ${alertName}`,
    body: requestSummary,
    data: { alertId, requestId },
    dedupeKey: `alert-match:${alertId}:${requestId}`,
  };
}

/**
 * Dispatched to a Listing's owner when a visitor submits the public
 * detail page's contact form (a general message or a VR-visit request).
 */
export function listingInquiryNotification(
  userId: string,
  listingId: string,
  listingTitle: string,
  inquiryId: string,
  inquiryType: 'MESSAGE' | 'VR_VISIT',
  fromName: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'LISTING_INQUIRY',
    title:
      inquiryType === 'VR_VISIT'
        ? `Demande de visite VR — ${listingTitle}`
        : `Nouveau message — ${listingTitle}`,
    body: `${fromName} s'intéresse à « ${listingTitle} ».`,
    data: { listingId, inquiryId },
    dedupeKey: `listing-inquiry:${inquiryId}`,
  };
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export function subscriptionReminderNotification(
  userId: string,
  daysLeft: 7 | 3,
  periodEnd: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_REMINDER',
    title: `Votre abonnement expire dans ${daysLeft} jours`,
    body: `Renouvelez avant le ${isoDay(periodEnd)} pour garder toutes vos annonces en ligne.`,
    data: { daysLeft, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-reminder:${userId}:${periodEnd.toISOString()}:${daysLeft}`,
  };
}

export function subscriptionGraceNotification(
  userId: string,
  periodEnd: Date,
  freeLimit: number | null,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_GRACE',
    title: 'Votre abonnement a expiré',
    body:
      freeLimit === null
        ? 'Vous avez 7 jours pour renouveler votre abonnement.'
        : `Vous avez 7 jours pour renouveler avant le masquage de vos annonces au-delà de ${freeLimit}.`,
    data: { periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-grace:${userId}:${periodEnd.toISOString()}`,
  };
}

export function subscriptionExpiredNotification(
  userId: string,
  hiddenCount: number,
  periodEnd: Date,
  disabledAlerts = 0,
): CreateNotificationInput {
  const parts: string[] = [];
  if (hiddenCount > 0) {
    parts.push(
      `${hiddenCount} annonce(s) ont été masquées. Elles reviendront dès le renouvellement.`,
    );
  }
  if (disabledAlerts > 0) {
    parts.push(`${disabledAlerts} alerte(s) secteur ont été désactivées.`);
  }
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRED',
    title: 'Abonnement terminé',
    body: parts.length > 0 ? parts.join(' ') : 'Votre compte repasse au plan Gratuit.',
    data: { hiddenCount, disabledAlerts, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-expired:${userId}:${periodEnd.toISOString()}`,
  };
}

export function trialReminderNotification(userId: string, trialEnd: Date): CreateNotificationInput {
  return {
    userId,
    type: 'TRIAL_REMINDER',
    title: 'Votre essai Pro se termine bientôt',
    body: `Votre essai gratuit se termine le ${isoDay(trialEnd)}. Passez à Pro pour garder vos 30 annonces et vos alertes.`,
    data: { trialEnd: trialEnd.toISOString() },
    dedupeKey: `trial-reminder:${userId}:${trialEnd.toISOString()}`,
  };
}

export function trialEndedNotification(
  userId: string,
  hiddenCount: number,
  trialEnd: Date,
  disabledAlerts = 0,
): CreateNotificationInput {
  const parts: string[] = ['Votre essai Pro est terminé, votre compte repasse au plan Gratuit.'];
  if (hiddenCount > 0) {
    parts.push(
      `${hiddenCount} annonce(s) ont été masquées. Elles reviendront si vous passez à Pro.`,
    );
  }
  if (disabledAlerts > 0) {
    parts.push(`${disabledAlerts} alerte(s) secteur ont été désactivées.`);
  }
  return {
    userId,
    type: 'TRIAL_ENDED',
    title: 'Essai Pro terminé',
    body: parts.join(' '),
    data: { hiddenCount, disabledAlerts, trialEnd: trialEnd.toISOString() },
    dedupeKey: `trial-ended:${userId}:${trialEnd.toISOString()}`,
  };
}
