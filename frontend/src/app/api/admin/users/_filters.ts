// Shared query-param → Prisma where builder for the admin users list and
// its CSV export. Not a route file (underscore prefix) — App Router
// ignores it for routing. Mirrors admin/listings/_filters.ts.
//
// `type` is a UI-only concept derived from real columns (no schema change
// needed): accountType=TENANT_BUYER → PARTICULIER; accountType=OWNER_AGENT
// → AGENCE if the user owns at least one Organization, else DEMARCHEUR
// (an agent who hasn't (yet) registered an agency — "démarcheur"/broker).
import 'server-only';
import type { Prisma } from '@prisma/client';

const Q_MAX = 200;

function parseDateOrNull(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type UserTypeFilter = 'PARTICULIER' | 'AGENCE' | 'DEMARCHEUR';

export function typeWhere(type: string | null): Prisma.UserWhereInput {
  switch (type) {
    case 'PARTICULIER':
      return { accountType: 'TENANT_BUYER' };
    case 'AGENCE':
      return { accountType: 'OWNER_AGENT', ownedOrganizations: { some: {} } };
    case 'DEMARCHEUR':
      return { accountType: 'OWNER_AGENT', ownedOrganizations: { none: {} } };
    default:
      return {};
  }
}

export function buildUserFilterWhere(sp: URLSearchParams): Prisma.UserWhereInput {
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const from = parseDateOrNull(sp.get('from'));
  const to = parseDateOrNull(sp.get('to'));
  const createdAt =
    from != null || to != null
      ? { ...(from != null && { gte: from }), ...(to != null && { lte: to }) }
      : undefined;

  return {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(sp.get('status') ? { status: sp.get('status')! } : {}),
    ...(sp.get('role') ? { role: sp.get('role')! } : {}),
    ...(sp.get('country') ? { country: sp.get('country')! } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...typeWhere(sp.get('type')),
  };
}
