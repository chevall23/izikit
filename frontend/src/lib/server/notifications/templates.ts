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
import { formatAmount, formatDateFr } from '../emails/templates';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Bienvenue sur Habitat Afrik !',
    body: `Votre compte (${email}) est créé. Complétez votre profil pour inspirer confiance, puis publiez votre première annonce ou déposez une demande.`,
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
  /** What the payment bought ("Pack Starter : 50 jetons crédités"). */
  description?: string,
): CreateNotificationInput {
  const paid = formatAmount(amount, currency);
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Paiement confirmé',
    body: description
      ? `${description}. Votre paiement de ${paid} a bien été reçu, merci !`
      : `Votre paiement de ${paid} a bien été reçu, merci !`,
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
    title: `Nouvelle demande dans votre secteur — ${alertName}`,
    body: `${requestSummary}. Ouvrez la demande pour voir les détails et contacter le demandeur.`,
    data: { alertId, requestId },
    dedupeKey: `alert-match:${alertId}:${requestId}`,
  };
}

/**
 * Dispatched to every admin when a new PropertyRequest lands in REVIEW
 * (trust score under the threshold — see lib/server/requests/trust.ts).
 */
export function requestNeedsReviewNotification(
  adminId: string,
  requestId: string,
  summary: string,
): CreateNotificationInput {
  return {
    userId: adminId,
    type: 'REQUEST_REVIEW',
    title: 'Demande immobilière à vérifier',
    body: `${summary} — jugée douteuse par le contrôle automatique. Approuvez-la ou rejetez-la pour qu'elle soit (ou non) visible des agents.`,
    data: { requestId },
    dedupeKey: `request-review:${adminId}:${requestId}`,
  };
}

/** Admins: a requester says no agent contacted them (feedback form). */
export function requestNoContactNotification(
  adminId: string,
  requestId: string,
  summary: string,
): CreateNotificationInput {
  return {
    userId: adminId,
    type: 'REQUEST_NO_CONTACT',
    title: "Demandeur sans contact d'agent",
    body: `${summary} — le demandeur indique qu'aucun agent ne l'a contacté. Relancez les agents concernés.`,
    data: { requestId },
    dedupeKey: `request-no-contact:${adminId}:${requestId}`,
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
    body:
      inquiryType === 'VR_VISIT'
        ? `${fromName} souhaite visiter « ${listingTitle} » en visite virtuelle. Répondez-lui depuis « Contacts reçus ».`
        : `${fromName} s'intéresse à « ${listingTitle} ». Répondez-lui rapidement depuis « Contacts reçus ».`,
    data: { listingId, inquiryId },
    dedupeKey: `listing-inquiry:${inquiryId}`,
  };
}

export function subscriptionReminderNotification(
  userId: string,
  daysLeft: 7 | 3,
  periodEnd: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_REMINDER',
    title: `Votre abonnement expire dans ${daysLeft} jours`,
    body: `Il prend fin le ${formatDateFr(periodEnd)}. Renouvelez-le pour garder toutes vos annonces en ligne et vos avantages.`,
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
    title: 'Votre abonnement a expiré — 7 jours pour renouveler',
    body:
      freeLimit === null
        ? 'Vous avez 7 jours pour renouveler votre abonnement.'
        : `Vos annonces restent en ligne pendant 7 jours. Passé ce délai, seules vos ${freeLimit} plus récentes resteront visibles : les autres seront masquées (pas supprimées) et reviendront dès le renouvellement.`,
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
  const parts: string[] = ['Votre abonnement est terminé : votre compte repasse au plan Gratuit.'];
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
    body: parts.join(' '),
    data: { hiddenCount, disabledAlerts, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-expired:${userId}:${periodEnd.toISOString()}`,
  };
}

export function trialReminderNotification(userId: string, trialEnd: Date): CreateNotificationInput {
  return {
    userId,
    type: 'TRIAL_REMINDER',
    title: 'Votre essai Pro se termine bientôt',
    body: `Votre essai gratuit se termine le ${formatDateFr(trialEnd)}. Passez à Pro avant cette date pour garder vos 30 annonces et vos alertes.`,
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

/** The agent's listing passed moderation and is now public. */
export function listingApprovedNotification(
  userId: string,
  listingId: string,
  listingTitle: string,
  moderatedAt: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'LISTING_APPROVED',
    title: 'Annonce publiée',
    body: `« ${listingTitle} » a été validée : elle est maintenant visible par tous les visiteurs.`,
    data: { listingId },
    dedupeKey: `listing-approved:${listingId}:${moderatedAt.toISOString()}`,
  };
}

/** The listing was refused; the reason tells the agent what to fix. */
export function listingRejectedNotification(
  userId: string,
  listingId: string,
  listingTitle: string,
  reason: string,
  moderatedAt: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'LISTING_REJECTED',
    title: 'Annonce refusée',
    body: `« ${listingTitle} » n'a pas été validée. Motif : ${reason}. Corrigez-la puis soumettez-la à nouveau.`,
    data: { listingId, reason },
    dedupeKey: `listing-rejected:${listingId}:${moderatedAt.toISOString()}`,
  };
}

export function withdrawalRequestedNotification(
  userId: string,
  withdrawalId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'WITHDRAWAL_REQUESTED',
    title: 'Demande de retrait enregistrée',
    body: `Votre retrait de ${formatAmount(amount, currency)} est en cours de traitement. Vous serez prévenu dès qu'il sera finalisé.`,
    data: { withdrawalId, amount, currency },
    dedupeKey: `withdrawal-requested:${withdrawalId}`,
  };
}

export function withdrawalCancelledNotification(
  userId: string,
  withdrawalId: string,
  amount: number,
  currency: string,
  reason: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'WITHDRAWAL_CANCELLED',
    title: 'Retrait annulé',
    body: `Votre retrait de ${formatAmount(amount, currency)} a été annulé par notre équipe. Motif : ${reason}. Le montant reste disponible sur votre solde.`,
    data: { withdrawalId, amount, currency, reason },
    dedupeKey: `withdrawal-cancelled:${withdrawalId}`,
  };
}

const REVIEW_COMMENT_PREVIEW = 140;

/** An agent received a rating on their public profile. */
export function newReviewNotification(
  agentId: string,
  reviewId: string,
  rating: number,
  authorLabel: string,
  comment: string,
): CreateNotificationInput {
  const text = comment.trim();
  const preview =
    text.length > REVIEW_COMMENT_PREVIEW ? `${text.slice(0, REVIEW_COMMENT_PREVIEW)}…` : text;
  return {
    userId: agentId,
    type: 'NEW_REVIEW',
    title: `Nouvel avis : ${rating}/5`,
    body: `${authorLabel} vous a noté ${rating}/5${preview ? ` : « ${preview} »` : '.'} Il est visible sur votre profil public.`,
    data: { agentId, reviewId, rating },
    dedupeKey: `review:${reviewId}`,
  };
}
