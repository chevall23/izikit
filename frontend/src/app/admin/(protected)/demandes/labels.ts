// Display maps for /admin/demandes — shared by the list page and the filter
// bar. Keys mirror the PropertyRequest string enums documented in
// prisma/schema.prisma (transactionType / propertyType / priority / status
// are plain strings).
import type { AdminStatusTone } from '@/components/admin/AdminStatusBadge';

export const STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'Transmise',
  CLOTUREE: 'Archivée',
};

export const STATUS_TONE: Record<string, AdminStatusTone> = {
  EN_ATTENTE: 'warning',
  EN_COURS: 'success',
  CLOTUREE: 'neutral',
};

export const PRIORITY_TONE: Record<string, AdminStatusTone> = {
  Urgent: 'danger',
  Normale: 'neutral',
  Basse: 'success',
};

export const PRIORITIES = ['Urgent', 'Normale', 'Basse'];
export const FINANCINGS = ['Comptant', 'Crédit', 'Les deux'];
export const DELAYS = ['Immédiat', '1–3 mois', '3–6 mois', 'Flexible'];
export const CLIENT_TYPES = ['Particulier', 'Entreprise'];

export const PROPERTY_LABEL: Record<string, string> = {
  VILLA: 'Villa',
  APPARTEMENT: 'Appartement',
  PARCELLE: 'Parcelle',
  DOMAINE: 'Domaine',
  MAISON: 'Maison',
  BOUTIQUE: 'Boutique',
  BUREAU: 'Bureau',
  SALLE_FETE: 'Salle de fête',
  SALLE_CONFERENCE: 'Salle de conférence',
  IMMEUBLE: 'Immeuble',
};

export const TXN_LABEL: Record<string, string> = {
  VENTE: 'Achat / Vente',
  LOCATION: 'Location',
  SEJOUR: 'Séjour',
  AUBERGE: 'Auberge',
};

export function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

// Trust assessment (lib/server/requests/trust.ts): doubtful requests wait here
// for an admin decision and are hidden from agents until approved.
export const TRUST_LABEL: Record<string, string> = {
  TRUSTED: 'Fiable',
  REVIEW: 'À vérifier',
  REJECTED: 'Rejetée',
};

export const TRUST_TONE: Record<string, AdminStatusTone> = {
  TRUSTED: 'success',
  REVIEW: 'warning',
  REJECTED: 'danger',
};

export const TRUST_FLAG_LABEL: Record<string, string> = {
  HONEYPOT: 'Champ piège rempli (robot probable)',
  PHONE_PATTERN: 'Numéro de téléphone suspect (chiffres répétés ou suite)',
  DISPOSABLE_EMAIL: 'Adresse e-mail jetable',
  EMAIL_PATTERN: 'Adresse e-mail factice ou de test',
  NAME_JUNK: 'Nom fantaisiste ou de test',
  NAME_SINGLE: 'Nom en un seul mot',
  BUDGET_IMPLAUSIBLE: 'Budget incohérent avec le marché',
  DUPLICATE: 'Même recherche déjà envoyée avec ce numéro cette semaine',
  PHONE_FLOOD: 'Plus de 3 demandes avec ce numéro en 24 h',
};
