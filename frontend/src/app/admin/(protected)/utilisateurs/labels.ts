// Display maps for /admin/utilisateurs — shared by the list page and the
// filter bar. `type` and `displayStatus` are derived server-side (see
// frontend/src/lib/server/users/enrich.ts) from real columns, not stored
// as their own enum — the labels here just render them.
import type { AdminStatusTone } from '@/components/admin/AdminStatusBadge';

export const TYPE_LABEL: Record<string, string> = {
  PARTICULIER: 'Particulier',
  AGENCE: 'Agence',
  DEMARCHEUR: 'Démarcheur',
};

export const TYPE_TONE: Record<string, AdminStatusTone> = {
  PARTICULIER: 'neutral',
  AGENCE: 'primary',
  DEMARCHEUR: 'warning',
};

export const DISPLAY_STATUS_LABEL: Record<string, string> = {
  ACTIF: 'Actif',
  EN_VERIFICATION: 'En vérif.',
  SUSPENDU: 'Suspendu',
};

export const DISPLAY_STATUS_TONE: Record<string, AdminStatusTone> = {
  ACTIF: 'success',
  EN_VERIFICATION: 'warning',
  SUSPENDU: 'danger',
};

export const ROLE_LABEL: Record<string, string> = {
  USER: 'Utilisateur',
  ADMIN: 'Admin',
  SUPERADMIN: 'Super admin',
};

export const LEGAL_DOCUMENT_TYPE_LABEL: Record<string, string> = {
  ID_CARD: "Pièce d'identité",
  PRO_CARD: 'Carte professionnelle',
  RCCM: 'Registre de commerce (RCCM)',
  TAX_CERTIFICATE: 'Attestation fiscale',
  MANAGEMENT_MANDATE: 'Mandat de gestion',
  LIABILITY_INSURANCE: 'Assurance responsabilité civile',
};

export function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
