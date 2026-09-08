// Shared query-param → Prisma where builder for the admin property-requests
// list (/admin/demandes). Underscore prefix → App Router ignores it for
// routing. Mirrors api/admin/listings/_filters.ts.
import 'server-only';
import type { Prisma } from '@prisma/client';

const Q_MAX = 200;

function parseIntOrNull(raw: string | null): number | null {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildRequestFilterWhere(sp: URLSearchParams): Prisma.PropertyRequestWhereInput {
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const minBudget = parseIntOrNull(sp.get('minBudget'));
  const maxBudget = parseIntOrNull(sp.get('maxBudget'));
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
            { clientName: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(sp.get('status') ? { status: sp.get('status')! } : {}),
    ...(sp.get('country') ? { country: sp.get('country')! } : {}),
    ...(sp.get('city') ? { city: sp.get('city')! } : {}),
    ...(sp.get('propertyType') ? { propertyType: sp.get('propertyType')! } : {}),
    ...(sp.get('transactionType') ? { transactionType: sp.get('transactionType')! } : {}),
    ...(sp.get('priority') ? { priority: sp.get('priority')! } : {}),
    ...(minBudget != null ? { budgetMin: { gte: minBudget } } : {}),
    ...(maxBudget != null ? { budgetMax: { lte: maxBudget } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}
