/**
 * Every transactional email the platform sends, in French, rendered through
 * the shared layout. Inputs are plain text — escaping happens in the layout.
 */
import 'server-only';
import { renderEmail, type EmailContent } from './layout';

export type { EmailContent } from './layout';

// ── Accounts ────────────────────────────────────────────────────────────────

/** "dans 14 minutes" — floor-biased so the TTL is never overstated. */
export function ttlWordingFr(expiresAtIso: string | undefined): string {
  const fallback = 'sous peu';
  if (!expiresAtIso) return fallback;
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return fallback;
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return fallback;
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return "dans moins d'une minute";
  if (minutes < 60) return `dans ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `dans ${hours} heure${hours === 1 ? '' : 's'}`;
}

export function verificationCodeEmail(args: { code: string; expiresAt?: string }): EmailContent {
  const ttl = ttlWordingFr(args.expiresAt);
  return renderEmail({
    subject: 'Confirmez votre adresse e-mail',
    preheader: `Votre code de vérification Habitat Afrik : ${args.code}`,
    paragraphs: [
      'Bienvenue sur Habitat Afrik ! Pour activer votre compte, saisissez le code de vérification ci-dessous sur la page de confirmation.',
    ],
    code: args.code,
    closing: [
      `Ce code expire ${ttl}.`,
      "Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet e-mail : aucun compte ne sera activé.",
    ],
  });
}

export function passwordResetCodeEmail(args: { code: string; expiresAt?: string }): EmailContent {
  const ttl = ttlWordingFr(args.expiresAt);
  return renderEmail({
    subject: 'Réinitialisation de votre mot de passe',
    preheader: `Votre code de réinitialisation Habitat Afrik : ${args.code}`,
    paragraphs: [
      'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Habitat Afrik. Saisissez le code ci-dessous pour choisir un nouveau mot de passe.',
    ],
    code: args.code,
    closing: [
      `Ce code expire ${ttl}.`,
      "Si vous n'avez pas fait cette demande, ignorez cet e-mail : votre mot de passe actuel reste inchangé.",
    ],
  });
}

// ── Admin access requests ───────────────────────────────────────────────────

export function adminAccessCodeEmail(args: {
  name: string;
  code: string;
  ttlMinutes: number;
}): EmailContent {
  return renderEmail({
    subject: "Confirmez votre demande d'accès administrateur",
    preheader: `Votre code de vérification : ${args.code}`,
    greetingName: args.name,
    paragraphs: [
      "Merci pour votre demande d'accès à l'espace d'administration Habitat Afrik. Pour confirmer votre adresse e-mail, saisissez le code ci-dessous.",
    ],
    code: args.code,
    closing: [
      `Ce code expire dans ${args.ttlMinutes} minutes.`,
      "Une fois votre adresse confirmée, votre demande sera examinée par un super-administrateur. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    ],
  });
}

export function adminAccessNewRequestEmail(args: { requesterEmail: string }): EmailContent {
  return renderEmail({
    subject: "Nouvelle demande d'accès administrateur",
    preheader: `${args.requesterEmail} demande un accès administrateur`,
    paragraphs: [
      "Une nouvelle demande d'accès à l'espace d'administration vient d'être confirmée et attend votre décision.",
    ],
    details: [{ label: 'Demandeur', value: args.requesterEmail }],
    button: { label: 'Examiner la demande', path: '/admin/demandes-acces' },
  });
}

export function adminAccessApprovedEmail(args: { name: string }): EmailContent {
  return renderEmail({
    subject: 'Votre accès administrateur est activé',
    preheader: "Votre demande d'accès administrateur a été approuvée",
    greetingName: args.name,
    paragraphs: [
      "Bonne nouvelle : votre demande d'accès à l'espace d'administration Habitat Afrik a été approuvée.",
      "Vous pouvez dès maintenant vous connecter avec l'adresse e-mail et le mot de passe indiqués lors de votre demande.",
    ],
    button: { label: "Accéder à l'espace administrateur", path: '/admin/connexion' },
  });
}

export function adminAccessRejectedEmail(args: { name: string; reason?: string }): EmailContent {
  return renderEmail({
    subject: "Votre demande d'accès administrateur",
    preheader: "Réponse à votre demande d'accès administrateur",
    greetingName: args.name,
    paragraphs: [
      "Nous avons bien étudié votre demande d'accès à l'espace d'administration Habitat Afrik. Nous ne sommes malheureusement pas en mesure d'y donner une suite favorable.",
      ...(args.reason ? ['Motif communiqué :'] : []),
    ],
    ...(args.reason ? { quote: args.reason } : {}),
    closing: ["Pour toute question, n'hésitez pas à nous contacter via la page Contact du site."],
  });
}

// ── Contact & listings ──────────────────────────────────────────────────────

const CONTACT_SUBJECT_LABEL: Record<string, string> = {
  GENERAL: 'Question générale',
  SUPPORT: 'Support technique',
  PARTNERSHIP: 'Partenariat',
  AGENT: 'Devenir agent',
  PRESS: 'Presse',
  OTHER: 'Autre',
};

export function contactMessageEmail(args: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  country?: string;
  subject: string;
  message: string;
}): EmailContent {
  const topic = CONTACT_SUBJECT_LABEL[args.subject] ?? args.subject;
  const fullName = `${args.firstName} ${args.lastName}`.trim();
  return renderEmail({
    subject: `Nouveau message de contact — ${topic}`,
    preheader: `${fullName} vous a écrit via le formulaire de contact`,
    paragraphs: ['Un visiteur vous a écrit via le formulaire de contact du site.'],
    details: [
      { label: 'Nom', value: fullName },
      { label: 'E-mail', value: args.email },
      ...(args.phone ? [{ label: 'Téléphone', value: args.phone }] : []),
      ...(args.country ? [{ label: 'Pays', value: args.country }] : []),
      { label: 'Sujet', value: topic },
    ],
    quote: args.message,
    closing: [`Pour lui répondre, écrivez directement à ${args.email}.`],
  });
}

export function listingInquiryEmail(args: {
  type: 'MESSAGE' | 'VR_VISIT';
  listingTitle: string;
  name: string;
  phone: string;
  email?: string;
  message: string;
}): EmailContent {
  const vr = args.type === 'VR_VISIT';
  return renderEmail({
    subject: vr
      ? `Demande de visite virtuelle — ${args.listingTitle}`
      : `Nouveau message — ${args.listingTitle}`,
    preheader: `${args.name} ${vr ? 'souhaite visiter virtuellement' : 'vous a écrit au sujet de'} « ${args.listingTitle} »`,
    paragraphs: [
      vr
        ? `Un visiteur souhaite effectuer une visite virtuelle de votre annonce « ${args.listingTitle} ».`
        : `Un visiteur vous a envoyé un message au sujet de votre annonce « ${args.listingTitle} ».`,
    ],
    details: [
      { label: 'Nom', value: args.name },
      { label: 'Téléphone', value: args.phone },
      ...(args.email ? [{ label: 'E-mail', value: args.email }] : []),
    ],
    quote: args.message,
    button: { label: 'Voir mes contacts reçus', path: '/contacts' },
    closing: [
      'Nous vous conseillons de le recontacter rapidement : une réponse rapide augmente vos chances de conclure.',
    ],
  });
}

export function alertMatchEmail(args: { alertName: string; summary: string }): EmailContent {
  return renderEmail({
    subject: `Nouvelle correspondance pour votre alerte « ${args.alertName} »`,
    preheader: args.summary,
    paragraphs: [
      `Une nouvelle demande immobilière correspond à votre alerte secteur « ${args.alertName} ».`,
    ],
    details: [{ label: 'Demande', value: args.summary }],
    button: { label: 'Voir mes alertes', path: '/alertes' },
  });
}

// ── Payments & compliance ───────────────────────────────────────────────────

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'GNF']);

/** Amounts are stored in the smallest unit (FCFA = no decimals, EUR/USD = cents). */
export function formatAmount(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const value = ZERO_DECIMAL.has(code) ? amount : amount / 100;
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
    maximumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2,
  })
    .format(value)
    .replace(/[\u202f\u00a0]/g, ' ');
  return `${formatted} ${code === 'XOF' || code === 'XAF' ? 'FCFA' : code}`;
}

export function paymentConfirmationEmail(args: {
  orderId: string;
  amount: number;
  currency: string;
}): EmailContent {
  const amount = formatAmount(args.amount, args.currency);
  return renderEmail({
    subject: 'Confirmation de votre paiement',
    preheader: `Votre paiement de ${amount} a bien été reçu`,
    paragraphs: [
      'Nous vous confirmons la bonne réception de votre paiement. Merci pour votre confiance !',
    ],
    details: [
      { label: 'Commande', value: args.orderId },
      { label: 'Montant', value: amount },
    ],
    button: { label: 'Accéder à mon tableau de bord', path: '/dashboard' },
    closing: ['Conservez cet e-mail : il fait office de confirmation de paiement.'],
  });
}

const LEGAL_DOCUMENT_LABEL: Record<string, string> = {
  RCCM: "Registre de commerce de l'agence (RCCM)",
  TAX_CERTIFICATE: 'Attestation fiscale (IFU / NIF)',
  ID_CARD: "Pièce d'identité nationale (CNIB / Passeport)",
};

export function legalDocumentsSubmittedEmail(args: {
  userEmail: string;
  types: string[];
}): EmailContent {
  return renderEmail({
    subject: 'Nouveaux documents légaux à vérifier',
    preheader: `${args.userEmail} a soumis ${args.types.length} document(s) légal(aux)`,
    paragraphs: [
      `L'agent ${args.userEmail} vient de soumettre ${args.types.length} document(s) légal(aux) pour vérification.`,
    ],
    details: args.types.map((t, i) => ({
      label: `Document ${i + 1}`,
      value: LEGAL_DOCUMENT_LABEL[t] ?? t,
    })),
    button: { label: "Ouvrir l'administration", path: '/admin' },
  });
}
