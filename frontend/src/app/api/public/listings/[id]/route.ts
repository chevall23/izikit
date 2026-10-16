// PUBLIC-LISTING-DETAIL-01 — GET /api/public/listings/[id]
//
// Unauthenticated, read-only single-listing detail for the public
// "/annonces/[slug]" page. Same no-auth pattern as GET /api/public/listings.
// Only a VERIFIED listing is ever returned — 404 for DRAFT/PENDING/SOLD/
// missing, so this route never leaks a non-public listing's existence.
// The data itself comes from lib/server/public/listing.ts (shared with the
// server-rendered page). This route adds the per-visit side effects the page
// render must not have: Listing.viewCount increment (best-effort — a lost
// increment under a race is an acceptable trade-off for a vanity counter),
// a ListingView row, and city geocoding via Nominatim (best-effort).
// A view counts once per visitor per 24 h (lib/server/analytics/view-dedup.ts)
// and never when the listing's owner looks at their own listing.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { optionalAuth } from '@/lib/server/middleware';
import { clientIp } from '@/lib/server/middleware/rate-limit-by-email';
import { isFirstViewInWindow } from '@/lib/server/analytics/view-dedup';
import { geocodeCity } from '@/lib/server/geocode';
import { classifySource } from '@/lib/server/analytics/classify-source';
import { getPublicListing } from '@/lib/server/public/listing';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

/** Owners looking at their own listing never count; everyone else counts once per 24 h. */
async function shouldCountView(req: NextRequest, listingId: string): Promise<boolean> {
  const viewer = await optionalAuth(req.headers.get('authorization')).catch(() => null);
  if (viewer) {
    const owner = await prisma.listing
      .findUnique({ where: { id: listingId }, select: { userId: true } })
      .catch(() => null);
    if (owner?.userId === viewer.user.sub) return false;
  }
  return isFirstViewInWindow({
    listingId,
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent') ?? '',
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { id } = await ctx.params;

    const listing = await getPublicListing(id);
    if (!listing) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Listing not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let viewCount = listing.viewCount;
    if (await shouldCountView(req, id)) {
      try {
        const updated = await prisma.listing.update({
          where: { id },
          data: { viewCount: { increment: 1 } },
          select: { viewCount: true },
        });
        viewCount = updated.viewCount;
      } catch (err) {
        log.warn('listing-detail: viewCount increment failed', {
          listingId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }

      const source = classifySource(
        req.headers.get('referer'),
        req.nextUrl.searchParams.get('utm_source'),
      );
      try {
        await prisma.listingView.create({ data: { listingId: id, source } });
      } catch (err) {
        log.warn('listing-detail: ListingView write failed', {
          listingId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const location = await geocodeCity(listing.city, listing.country).catch(() => null);

    return NextResponse.json(
      { ...listing, viewCount, location },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
