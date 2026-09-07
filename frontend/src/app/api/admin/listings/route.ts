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

function buildFilterWhere(sp: URLSearchParams): Prisma.ListingWhereInput {
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const minPrice = parseIntOrNull(sp.get('minPrice'));
  const maxPrice = parseIntOrNull(sp.get('maxPrice'));
  const from = parseDateOrNull(sp.get('from'));
  const to = parseDateOrNull(sp.get('to'));
  const price =
    minPrice != null || maxPrice != null
      ? { ...(minPrice != null && { gte: minPrice }), ...(maxPrice != null && { lte: maxPrice }) }
      : undefined;
  const createdAt =
    from != null || to != null
      ? { ...(from != null && { gte: from }), ...(to != null && { lte: to }) }
      : undefined;

  return {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(sp.get('status') ? { status: sp.get('status')! } : {}),
    ...(sp.get('country') ? { country: sp.get('country')! } : {}),
    ...(sp.get('city') ? { city: sp.get('city')! } : {}),
    ...(sp.get('propertyType') ? { propertyType: sp.get('propertyType')! } : {}),
    ...(sp.get('transactionType') ? { transactionType: sp.get('transactionType')! } : {}),
    ...(price ? { price } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

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
    const filterWhere = buildFilterWhere(sp);
    const countsWhere: Prisma.ListingWhereInput = { ...filterWhere };
    delete (countsWhere as Record<string, unknown>).status;

    const listWhere: Prisma.ListingWhereInput = { ...filterWhere, ...cursorWhere(cursor) };

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
