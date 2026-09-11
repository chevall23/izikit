// Shared query-param → Prisma where builder for the admin finances
// transactions list and its CSV export. Not a route file (underscore
// prefix) — App Router ignores it for routing. `type` and refund status
// are real derived/actual columns — see order-kind.ts.
import 'server-only';
import type { Prisma } from '@prisma/client';

function parseDateOrNull(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `type` maps to `metadata.kind` — Prisma can filter a Json path directly
 * (Postgres `metadata->>'kind' = ...`), so this stays a single indexed-ish
 * where clause rather than a post-fetch JS filter.
 */
const Q_MAX = 200;

export function buildTransactionFilterWhere(sp: URLSearchParams): Prisma.OrderWhereInput {
  const type = sp.get('type');
  const status = sp.get('status');
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const from = parseDateOrNull(sp.get('from'));
  const to = parseDateOrNull(sp.get('to'));
  const createdAt =
    from != null || to != null
      ? { ...(from != null && { gte: from }), ...(to != null && { lte: to }) }
      : undefined;

  return {
    ...(type === 'TOKEN_PURCHASE'
      ? { metadata: { path: ['kind'], equals: 'token_purchase' } }
      : {}),
    ...(type === 'SUBSCRIPTION'
      ? { metadata: { path: ['kind'], equals: 'subscription_plan_change' } }
      : {}),
    ...(status ? { status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { customerEmail: { contains: q, mode: 'insensitive' } },
            { customerName: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}
