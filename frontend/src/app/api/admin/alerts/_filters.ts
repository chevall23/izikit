// Shared query-param → Prisma where builder for the admin sector-alerts
// list (/admin/alerte-secteur). Underscore prefix → App Router ignores it
// for routing. Mirrors api/admin/property-requests/_filters.ts.
import 'server-only';
import type { Prisma } from '@prisma/client';

const Q_MAX = 200;

function parseDateOrNull(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBoolOrNull(raw: string | null): boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export function buildAlertFilterWhere(sp: URLSearchParams): Prisma.AlertWhereInput {
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const from = parseDateOrNull(sp.get('from'));
  const to = parseDateOrNull(sp.get('to'));
  const active = parseBoolOrNull(sp.get('active'));
  const city = sp.get('city');
  const propertyType = sp.get('propertyType');
  const createdAt =
    from != null || to != null
      ? { ...(from != null && { gte: from }), ...(to != null && { lte: to }) }
      : undefined;

  return {
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    ...(active != null ? { active } : {}),
    ...(sp.get('country') ? { country: sp.get('country')! } : {}),
    ...(sp.get('transactionType') ? { transactionType: sp.get('transactionType')! } : {}),
    ...(sp.get('frequency') ? { frequency: sp.get('frequency')! } : {}),
    ...(city ? { cities: { array_contains: [city] } } : {}),
    ...(propertyType ? { propertyTypes: { array_contains: [propertyType] } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}
