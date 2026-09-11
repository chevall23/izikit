// Display maps for /admin/support — shared by the page and its filter bar.
// `severity` is derived server-side from `reason` (see
// lib/server/reports/severity.ts), not a stored column.
import type { AdminStatusTone } from '@/components/admin/AdminStatusBadge';

export const REASON_LABEL: Record<string, string> = {
  FAKE: 'Annonce frauduleuse',
  SOLD: 'Déjà vendu',
  INCORRECT_INFO: 'Informations incorrectes',
  SCAM: 'Arnaque',
  OTHER: 'Autre',
};

export const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Critique',
  MEDIUM: 'Moyenne',
  LOW: 'Faible',
};
export const SEVERITY_TONE: Record<string, AdminStatusTone> = {
  CRITICAL: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

// ListingReport.status only has 3 real values — no "in progress" state
// exists on the schema (real-data-only scope), so the drawer only offers
// Résoudre/Rejeter, not a 4th "en cours" state.
export const REPORT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Nouveau',
  REVIEWED: 'Résolu',
  DISMISSED: 'Rejeté',
};
export const REPORT_STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING: 'primary',
  REVIEWED: 'success',
  DISMISSED: 'neutral',
};

export const CONTACT_SUBJECT_LABEL: Record<string, string> = {
  GENERAL: 'Question générale',
  SUPPORT: 'Support',
  PARTNERSHIP: 'Partenariat',
  AGENT: 'Devenir agent',
  PRESS: 'Presse',
  OTHER: 'Autre',
};

export const CONTACT_STATUS_LABEL: Record<string, string> = {
  NEW: 'Nouveau',
  READ: 'Lu',
  ARCHIVED: 'Archivé',
};
export const CONTACT_STATUS_TONE: Record<string, AdminStatusTone> = {
  NEW: 'primary',
  READ: 'warning',
  ARCHIVED: 'neutral',
};

export function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
