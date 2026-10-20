/**
 * The e-mail twin of each in-app notification about the user's own account
 * (listing decision, subscription life-cycle, withdrawal). Every builder takes
 * the event facts and returns a function of the recipient's first name, which
 * is what notifyUser() expects. Each message says what happened, what it means
 * for the user, and gives the one button to act on it.
 */
import 'server-only';
import { formatAmount, formatDateFr, noticeEmail } from './templates';
import type { EmailBuilder } from '../notifications/notify-user';

export const listingApprovedEmail =
  (listingTitle: string): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre annonce est publiée',
      preheader: `« ${listingTitle} » est maintenant visible par tous les visiteurs`,
      paragraphs: [
        `Bonne nouvelle : votre annonce « ${listingTitle} » a été validée par notre équipe.`,
        'Elle est désormais visible par tous les visiteurs du site. Vous serez prévenu dès qu’un visiteur vous écrit.',
      ],
      button: { label: 'Voir mes annonces', path: '/listings' },
    });

export const listingRejectedEmail =
  (listingTitle: string, reason: string, listingId: string): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: "Votre annonce n'a pas été validée",
      preheader: `« ${listingTitle} » doit être corrigée avant publication`,
      paragraphs: [
        `Notre équipe n'a pas pu valider votre annonce « ${listingTitle} » pour le motif ci-dessous.`,
      ],
      quote: reason,
      button: { label: "Corriger l'annonce", path: `/listings/${listingId}/edit` },
      closing: [
        'Une fois les corrections faites, soumettez-la à nouveau : elle sera réexaminée rapidement.',
      ],
    });

export const subscriptionReminderEmail =
  (daysLeft: 7 | 3, periodEnd: Date): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: `Votre abonnement expire dans ${daysLeft} jours`,
      preheader: `Il prend fin le ${formatDateFr(periodEnd)}`,
      paragraphs: [
        `Votre abonnement Habitat Afrik prend fin le ${formatDateFr(periodEnd)}.`,
        'Renouvelez-le avant cette date pour garder toutes vos annonces en ligne, vos jetons offerts et vos alertes secteur.',
      ],
      button: { label: 'Renouveler mon abonnement', path: '/settings?tab=abonnement' },
    });

export const subscriptionGraceEmail =
  (freeLimit: number | null): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre abonnement a expiré : 7 jours pour renouveler',
      preheader: 'Vos annonces restent en ligne pendant 7 jours',
      paragraphs: [
        "Votre abonnement Habitat Afrik a expiré. Rien n'est perdu : vous avez 7 jours pour le renouveler.",
        freeLimit === null
          ? 'Passé ce délai, votre compte repassera au plan Gratuit.'
          : `Passé ce délai, votre compte repassera au plan Gratuit : seules vos ${freeLimit} annonces les plus récentes resteront visibles. Les autres seront masquées, pas supprimées, et reviendront dès le renouvellement.`,
      ],
      button: { label: 'Renouveler mon abonnement', path: '/settings?tab=abonnement' },
    });

export const subscriptionExpiredEmail =
  (hiddenCount: number, disabledAlerts: number): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre abonnement est terminé',
      preheader: 'Votre compte repasse au plan Gratuit',
      paragraphs: [
        'Votre abonnement Habitat Afrik est terminé : votre compte repasse au plan Gratuit.',
        ...(hiddenCount > 0
          ? [
              `${hiddenCount} annonce(s) ont été masquées. Elles ne sont pas supprimées et reviendront dès votre renouvellement.`,
            ]
          : []),
        ...(disabledAlerts > 0 ? [`${disabledAlerts} alerte(s) secteur ont été désactivées.`] : []),
      ],
      button: { label: 'Reprendre un abonnement', path: '/settings?tab=abonnement' },
    });

export const trialReminderEmail =
  (trialEnd: Date): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre essai Pro se termine bientôt',
      preheader: `Fin de l'essai le ${formatDateFr(trialEnd)}`,
      paragraphs: [
        `Votre essai gratuit du plan Pro se termine le ${formatDateFr(trialEnd)}.`,
        'Passez à Pro avant cette date pour garder vos 30 annonces et vos alertes secteur ; sinon votre compte repassera au plan Gratuit.',
      ],
      button: { label: 'Passer à Pro', path: '/settings?tab=abonnement' },
    });

export const trialEndedEmail =
  (hiddenCount: number, disabledAlerts: number): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre essai Pro est terminé',
      preheader: 'Votre compte repasse au plan Gratuit',
      paragraphs: [
        'Votre essai du plan Pro est terminé : votre compte repasse au plan Gratuit.',
        ...(hiddenCount > 0
          ? [`${hiddenCount} annonce(s) ont été masquées. Elles reviendront si vous passez à Pro.`]
          : []),
        ...(disabledAlerts > 0 ? [`${disabledAlerts} alerte(s) secteur ont été désactivées.`] : []),
      ],
      button: { label: 'Passer à Pro', path: '/settings?tab=abonnement' },
    });

export const withdrawalCancelledEmail =
  (amount: number, currency: string, reason: string): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: 'Votre retrait a été annulé',
      preheader: `Retrait de ${formatAmount(amount, currency)} annulé`,
      paragraphs: [
        `Votre demande de retrait de ${formatAmount(amount, currency)} a été annulée par notre équipe. Le montant reste disponible sur votre solde.`,
      ],
      quote: reason,
      closing: ['Pour toute question, répondez à ce message ou écrivez-nous via la page Contact.'],
    });

export const reviewReceivedEmail =
  (agentId: string, rating: number, authorLabel: string, comment: string): EmailBuilder =>
  ({ firstName }) =>
    noticeEmail({
      firstName,
      subject: `Un client vous a laissé un avis de ${rating}/5`,
      preheader: `${authorLabel} vous a noté ${rating}/5`,
      paragraphs: [
        `${authorLabel} vous a noté ${rating}/5. Cet avis est visible sur votre profil public.`,
        ...(comment.trim() ? ['Son commentaire :'] : []),
      ],
      ...(comment.trim() ? { quote: comment.trim() } : {}),
      button: { label: 'Voir mon profil public', path: `/agents/${agentId}` },
      closing: [
        'Répondre rapidement et soigneusement aux demandeurs est le meilleur moyen de faire remonter votre note.',
      ],
    });
