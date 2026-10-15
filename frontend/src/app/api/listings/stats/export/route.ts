// LISTINGS-STATS-02 — GET /api/listings/stats/export
//
// CSV export of the statistics, Agence plan only. Same perimeter as
// GET /api/listings/stats (the caller's own non-draft listings) with a
// per-listing breakdown of views and contacts over the period.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { canExport, getStatsLevel } from '@/lib/server/stats/level';
import { PERIOD_DAYS, dateKey, trend } from '@/lib/server/stats/helpers';
import { buildStatsCsv } from '@/lib/server/stats/csv';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.sub;

    if (!canExport(await getStatsLevel(prisma, userId))) {
      return NextResponse.json(
        { error: 'PLAN_REQUIRED', message: 'L’export est réservé au plan Agence.' },
        { status: 403, headers },
      );
    }

    const period = req.nextUrl.searchParams.get('period') ?? '30j';
    const days = Object.hasOwn(PERIOD_DAYS, period) ? PERIOD_DAYS[period] : undefined;
    if (!days) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Période invalide.' },
        { status: 400, headers },
      );
    }

    const now = new Date();
    const start = new Date(now.getTime() - days * 86_400_000);
    const prevStart = new Date(start.getTime() - days * 86_400_000);
    const scope = { listing: { userId } } as const;

    const [
      viewsCur,
      viewsPrev,
      contactsCur,
      contactsPrev,
      visitsCur,
      visitsPrev,
      viewRows,
      viewsPerListing,
      listings,
    ] = await Promise.all([
      prisma.listingView.count({ where: { ...scope, createdAt: { gte: start } } }),
      prisma.listingView.count({ where: { ...scope, createdAt: { gte: prevStart, lt: start } } }),
      prisma.listingInquiry.count({ where: { ...scope, createdAt: { gte: start } } }),
      prisma.listingInquiry.count({
        where: { ...scope, createdAt: { gte: prevStart, lt: start } },
      }),
      prisma.visit.count({
        where: {
          inquiry: { listing: { userId } },
          status: 'CONFIRMEE',
          scheduledAt: { gte: start },
        },
      }),
      prisma.visit.count({
        where: {
          inquiry: { listing: { userId } },
          status: 'CONFIRMEE',
          scheduledAt: { gte: prevStart, lt: start },
        },
      }),
      prisma.listingView.findMany({
        where: { ...scope, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      prisma.listingView.groupBy({
        by: ['listingId'],
        where: { ...scope, createdAt: { gte: start } },
        _count: { _all: true },
      }),
      prisma.listing.findMany({
        where: { userId, status: { not: 'DRAFT' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          city: true,
          country: true,
          propertyType: true,
          transactionType: true,
          status: true,
          price: true,
          currency: true,
          _count: { select: { inquiries: { where: { createdAt: { gte: start } } } } },
        },
      }),
    ]);

    const conversionCur = viewsCur > 0 ? (contactsCur / viewsCur) * 100 : 0;
    const conversionPrev = viewsPrev > 0 ? (contactsPrev / viewsPrev) * 100 : 0;

    const byDay = new Map<string, number>();
    for (const v of viewRows) {
      const key = dateKey(v.createdAt);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const viewsByDay: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dateKey(new Date(now.getTime() - i * 86_400_000));
      viewsByDay.push({ date: key, count: byDay.get(key) ?? 0 });
    }

    const viewsOf = new Map(viewsPerListing.map((g) => [g.listingId, g._count._all]));

    const csv = buildStatsCsv({
      period,
      kpis: [
        { label: 'Vues', value: viewsCur, trendPct: trend(viewsCur, viewsPrev).trendPct },
        {
          label: 'Contacts reçus',
          value: contactsCur,
          trendPct: trend(contactsCur, contactsPrev).trendPct,
        },
        {
          label: 'Visites confirmées',
          value: visitsCur,
          trendPct: trend(visitsCur, visitsPrev).trendPct,
        },
        {
          label: 'Taux de conversion (%)',
          value: Math.round(conversionCur * 10) / 10,
          trendPct: trend(conversionCur, conversionPrev).trendPct,
        },
      ],
      viewsByDay,
      listings: listings.map((l) => ({
        title: l.title,
        city: l.city,
        country: l.country,
        propertyType: l.propertyType,
        transactionType: l.transactionType,
        status: l.status,
        price: l.price,
        currency: l.currency,
        views: viewsOf.get(l.id) ?? 0,
        contacts: l._count.inquiries,
      })),
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...headers,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="statistiques-${period}-${dateKey(now)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  });
}
