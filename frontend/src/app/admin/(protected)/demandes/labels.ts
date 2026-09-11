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
