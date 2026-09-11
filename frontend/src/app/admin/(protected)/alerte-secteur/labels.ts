// Display maps for /admin/alerte-secteur — shared by the list page, the
// filter bar and the edit form. Keys mirror the Alert string fields in
// prisma/schema.prisma (transactionType / propertyTypes / frequency are
// plain strings / string[]).
import type { AdminStatusTone } from '@/components/admin/AdminStatusBadge';

export const ACTIVE_LABEL: Record<'true' | 'false', string> = {
  true: 'Active',
  false: 'En pause',
};

export const ACTIVE_TONE: Record<'true' | 'false', AdminStatusTone> = {
  true: 'success',
  false: 'warning',
};

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

export const FREQUENCY_LABEL: Record<string, string> = {
  QUOTIDIENNE: 'Quotidienne',
  HEBDOMADAIRE: 'Hebdomadaire',
};

export const FREQUENCIES = ['QUOTIDIENNE', 'HEBDOMADAIRE'];

// PropertyRequest status labels — used to render the linked demandes in the
// "dernières correspondances" list of the drawer.
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'Transmise',
  CLOTUREE: 'Archivée',
};

export function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
