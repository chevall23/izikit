// Derived, UI-facing user fields shared by the admin users list/detail/export
// routes. Kept out of the Prisma schema on purpose — every input here is
// already a real column/relation (User.accountType, Organization ownership,
// LegalDocument.status), so no migration is needed to back the /admin/utilisateurs
// mockup's "type" + "statut" + "vérifié KYC" concepts.
import 'server-only';

// Same required-document-type count used by the public agent directory
// (frontend/src/app/api/public/agents/route.ts) — six LegalDocument.type
// values an OWNER_AGENT can submit. Duplicated rather than imported since
// that route isn't a shared module (App Router route files aren't meant
// to be imported from).
export const LEGAL_DOCUMENT_TYPE_COUNT = 6;

export type AdminUserType = 'PARTICULIER' | 'AGENCE' | 'DEMARCHEUR';
export type AdminUserDisplayStatus = 'ACTIF' | 'EN_VERIFICATION' | 'SUSPENDU';

export function computeUserType(input: {
  accountType: string;
  ownedOrgCount: number;
}): AdminUserType {
  if (input.accountType !== 'OWNER_AGENT') return 'PARTICULIER';
  return input.ownedOrgCount > 0 ? 'AGENCE' : 'DEMARCHEUR';
}

/**
 * "En vérification" only applies to OWNER_AGENT accounts that haven't
 * submitted+had verified all required LegalDocument types yet. A
 * TENANT_BUYER has nothing to verify, so it's always ACTIF (unless
 * SUSPENDU). SUSPENDU always wins.
 */
export function computeDisplayStatus(input: {
  status: string;
  accountType: string;
  verifiedDocCount: number;
}): AdminUserDisplayStatus {
  if (input.status === 'SUSPENDED') return 'SUSPENDU';
  if (input.accountType === 'OWNER_AGENT' && input.verifiedDocCount < LEGAL_DOCUMENT_TYPE_COUNT) {
    return 'EN_VERIFICATION';
  }
  return 'ACTIF';
}
