// ADMIN-FINANCES-01 — GET /api/admin/finances/summary
//
// KPIs + 6-month revenue trend + country breakdown for /admin/finances.
// Built entirely from PAID Order rows (the only two order kinds this
// starter's payment flow produces — see order-kind.ts) plus User.country
// for the geo split. No new schema — Order already carries everything
// needed (amount, status, metadata.kind, paidAt, userId).
//
// Sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → three read passes over Order (this month +
// last month for deltas, 6-month trend, this month's country split) →
// aggregate in JS (Prisma can't groupBy on a Json field or a joined
// relation column in one query) → return.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { orderKind } from '@/lib/server/finances/order-kind';

const MONTHS_BACK = 6;
const TOP_COUNTRIES = 5;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "n/a" (no prior baseline)
  return ((current - previous) / previous) * 100;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = addMonths(thisMonthStart, -1);
    const trendStart = addMonths(thisMonthStart, -(MONTHS_BACK - 1));

    const [thisMonthOrders, lastMonthOrders, trendOrders, thisMonthTxnAll] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: thisMonthStart } },
        select: { amount: true, currency: true, metadata: true, userId: true },
      }),
      prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: lastMonthStart, lt: thisMonthStart } },
        select: { amount: true, metadata: true },
      }),
      prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: trendStart } },
        select: { amount: true, metadata: true, paidAt: true },
      }),
      // Every order attempted this month (any status) — for the
      // succeeded/failed transaction-count KPI.
      prisma.order.findMany({
        where: { createdAt: { gte: thisMonthStart } },
        select: { status: true },
      }),
    ]);

    function sumByKind(rows: { amount: number; metadata: unknown }[]) {
      let tokenAmount = 0;
      let subscriptionAmount = 0;
      let other = 0;
      let tokenCount = 0;
      for (const r of rows) {
        const kind = orderKind(r.metadata);
        if (kind === 'TOKEN_PURCHASE') {
          tokenAmount += r.amount;
          tokenCount += 1;
        } else if (kind === 'SUBSCRIPTION') {
          subscriptionAmount += r.amount;
        } else {
          other += r.amount;
        }
      }
      return { tokenAmount, subscriptionAmount, other, tokenCount };
    }

    const thisMonth = sumByKind(thisMonthOrders);
    const lastMonth = sumByKind(lastMonthOrders);
    const thisMonthTotal = thisMonth.tokenAmount + thisMonth.subscriptionAmount + thisMonth.other;
    const lastMonthTotal = lastMonth.tokenAmount + lastMonth.subscriptionAmount + lastMonth.other;

    const succeeded = thisMonthTxnAll.filter((o) => o.status === 'PAID').length;
    const failed = thisMonthTxnAll.filter((o) => o.status === 'FAILED').length;

    // 6-month trend, bucketed by paidAt's calendar month (UTC).
    const buckets = new Map<string, { tokenAmount: number; subscriptionAmount: number }>();
    for (let i = 0; i < MONTHS_BACK; i++) {
      buckets.set(monthKey(addMonths(trendStart, i)), { tokenAmount: 0, subscriptionAmount: 0 });
    }
    for (const o of trendOrders) {
      if (!o.paidAt) continue;
      const key = monthKey(o.paidAt);
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside window (shouldn't happen given the query filter)
      const kind = orderKind(o.metadata);
      if (kind === 'TOKEN_PURCHASE') bucket.tokenAmount += o.amount;
      else if (kind === 'SUBSCRIPTION') bucket.subscriptionAmount += o.amount;
    }
    const revenueSeries = [...buckets.entries()].map(([month, v]) => ({ month, ...v }));

    // Country split — join through User.country (nullable; guest checkout
    // has userId=null). Small admin-dashboard-scale dataset, aggregated in
    // JS since Prisma can't groupBy across a relation in one query.
    const userIds = [
      ...new Set(thisMonthOrders.map((o) => o.userId).filter((id): id is string => id != null)),
    ];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, country: true },
        })
      : [];
    const countryByUser = new Map(users.map((u) => [u.id, u.country]));
    const countryTotals = new Map<string, number>();
    for (const o of thisMonthOrders) {
      const country = (o.userId && countryByUser.get(o.userId)) || 'Autre';
      countryTotals.set(country, (countryTotals.get(country) ?? 0) + o.amount);
    }
    const sortedCountries = [...countryTotals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sortedCountries.slice(0, TOP_COUNTRIES);
    const restTotal = sortedCountries.slice(TOP_COUNTRIES).reduce((s, [, v]) => s + v, 0);
    const countryRows = restTotal > 0 ? [...top, ['Autre', restTotal] as [string, number]] : top;
    const countryShare = countryRows.map(([country, amount]) => ({
      country,
      amount,
      pct: thisMonthTotal > 0 ? Math.round((amount / thisMonthTotal) * 1000) / 10 : 0,
    }));

    return NextResponse.json(
      {
        currency: 'XOF',
        kpis: {
          tokenRevenue: {
            amount: thisMonth.tokenAmount,
            deltaPct: pctDelta(thisMonth.tokenAmount, lastMonth.tokenAmount),
            packsSold: thisMonth.tokenCount,
          },
          subscriptionRevenue: {
            amount: thisMonth.subscriptionAmount,
            deltaPct: pctDelta(thisMonth.subscriptionAmount, lastMonth.subscriptionAmount),
          },
          totalRevenue: {
            amount: thisMonthTotal,
            deltaPct: pctDelta(thisMonthTotal, lastMonthTotal),
          },
          transactions: {
            total: thisMonthTxnAll.length,
            succeeded,
            failed,
          },
        },
        revenueSeries,
        countryShare,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
