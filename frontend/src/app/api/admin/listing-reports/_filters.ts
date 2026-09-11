// Shared query-param → Prisma where builder for the admin listing-reports
// list and its CSV export. Not a route file (underscore prefix) — App
// Router ignores it for routing. `severity` is derived (see
// lib/server/reports/severity.ts), not a stored column.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { reasonsForSeverity } from '@/lib/server/reports/severity';

const Q_MAX = 200;

function parseDateOrNull(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildReportFilterWhere(sp: URLSearchParams): Prisma.ListingReportWhereInput {
  const status = sp.get('status');
  const reason = sp.get('reason');
  const severity = sp.get('severity');
  const country = sp.get('country');
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const from = parseDateOrNull(sp.get('from'));
  const to = parseDateOrNull(sp.get('to'));
  const createdAt =
    from != null || to != null
      ? { ...(from != null && { gte: from }), ...(to != null && { lte: to }) }
      : undefined;

  return {
    ...(status ? { status } : {}),
    // `reason` is a straight-up equality filter; `severity` maps to a set
    // of reasons — if both are present, reason (the more specific one)
    // wins rather than the two conflicting.
    ...(reason ? { reason } : severity ? { reason: { in: reasonsForSeverity(severity) } } : {}),
    ...(country ? { listing: { country } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { detail: { contains: q, mode: 'insensitive' } },
            { listing: { title: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}
