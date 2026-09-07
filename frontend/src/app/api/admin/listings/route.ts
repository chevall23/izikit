// ADMIN-LISTINGS-01 — GET /api/admin/listings
//
// Filtered, cursor-paginated moderation queue for /admin/annonces.
// Mirrors GET /api/admin/users: requireAdmin('ADMIN') → enforceAdminRateLimit
// → parse filters → findMany(take limit+1) → buildPage. Adds a `counts`
// block (one count() per status) for the status tabs. Empty result is
// 200 { items: [] }, never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildListingFilterWhere } from './_filters';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));

    // counts reflect every filter EXCEPT status (tabs show per-status totals
    // of the otherwise-filtered set).
    const filterWhere = buildListingFilterWhere(sp);
    const countsWhere: Prisma.ListingWhereInput = { ...filterWhere };
    delete (countsWhere as Record<string, unknown>).status;

    // AND-combine so the cursor's OR (createdAt keyset) can't overwrite the
    // filter's OR (q → title/city contains). Spread-merging would clobber the
    // first `OR` and list rows that don't match `q` from page 2 onward.
    const listWhere: Prisma.ListingWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, all, pending, verified, rejected, sold] = await Promise.all([
      prisma.listing.findMany({
        where: listWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          title: true,
          city: true,
          country: true,
          propertyType: true,
          transactionType: true,
          price: true,
          currency: true,
          status: true,
          viewCount: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      }),
      prisma.listing.count({ where: { ...countsWhere, status: { not: 'DRAFT' } } }),
      prisma.listing.count({ where: { ...countsWhere, status: 'PENDING' } }),
      prisma.listing.count({ where: { ...countsWhere, status: 'VERIFIED' } }),
      prisma.listing.count({ where: { ...countsWhere, status: 'REJECTED' } }),
      prisma.listing.count({ where: { ...countsWhere, status: 'SOLD' } }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = (page.items as typeof rows).map((r) => ({
      id: r.id,
      title: r.title,
      city: r.city,
      country: r.country,
      propertyType: r.propertyType,
      transactionType: r.transactionType,
      price: r.price,
      currency: r.currency,
      status: r.status,
      viewCount: r.viewCount,
      createdAt: r.createdAt,
      owner: r.user ? { id: r.user.id, name: r.user.name } : null,
      thumbnailUrl: r.photos[0]?.url ?? null,
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, counts: { all, pending, verified, rejected, sold } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
