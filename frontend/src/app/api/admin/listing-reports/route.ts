// ADMIN-LISTING-REPORTS-01 — GET /api/admin/listing-reports
//
// Moderation queue for visitor-submitted listing reports (the public
// POST endpoint at /api/public/listings/[id]/reports). Cursor pagination
// mirrors GET /api/admin/withdrawals's shared helpers. `status` filter is
// optional (omit to see every status); pass `?status=PENDING` for the
// actionable queue. Now consumed by /admin/support ("Signalements" tab) —
// adds q/severity/country/date filters (see _filters.ts) and a `total`
// count for the numbered pagination + tab badge.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildReportFilterWhere } from './_filters';
import { reportSeverity } from '@/lib/server/reports/severity';

const REPORT_SELECT = {
  id: true,
  listingId: true,
  reason: true,
  detail: true,
  status: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      status: true,
      city: true,
      country: true,
      price: true,
      currency: true,
      photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
    },
  },
} as const satisfies Prisma.ListingReportSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const filterWhere = buildReportFilterWhere(url.searchParams);
    const where: Prisma.ListingReportWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, total] = await Promise.all([
      prisma.listingReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: REPORT_SELECT,
      }),
      prisma.listingReport.count({ where: filterWhere }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = (page.items as typeof rows).map((r) => ({
      id: r.id,
      reason: r.reason,
      severity: reportSeverity(r.reason),
      detail: r.detail,
      status: r.status,
      createdAt: r.createdAt,
      listing: {
        id: r.listing.id,
        title: r.listing.title,
        status: r.listing.status,
        city: r.listing.city,
        country: r.listing.country,
        price: r.listing.price,
        currency: r.listing.currency,
        thumbnailUrl: r.listing.photos[0]?.url ?? null,
      },
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, total },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
