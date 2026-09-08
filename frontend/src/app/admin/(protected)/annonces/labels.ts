// Display maps for /admin/annonces — shared by the list page and the filter
// bar. Keys mirror the Listing enums documented in prisma/schema.prisma
// (propertyType / transactionType / status / standing are plain strings).
import type { AdminStatusTone } from '@/components/admin/AdminStatusBadge';

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  VERIFIED: 'Validée',
  REJECTED: 'Rejetée',
  SOLD: 'Vendue',
  DRAFT: 'Brouillon',
};

export const STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SOLD: 'neutral',
  DRAFT: 'neutral',
};

export const TXN_LABEL: Record<string, string> = {
  VENTE: 'Vente',
  LOCATION: 'Location',
  SEJOUR: 'Séjour',
  AUBERGE: 'Auberge',
};

export const TXN_TONE: Record<string, AdminStatusTone> = {
  VENTE: 'primary',
  LOCATION: 'violet',
  SEJOUR: 'primary',
  AUBERGE: 'violet',
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

export const STANDING_LABEL: Record<string, string> = {
  BASIC: 'Standard',
  MID: 'Bon standing',
  HIGH: 'Haut standing',
};

export function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
