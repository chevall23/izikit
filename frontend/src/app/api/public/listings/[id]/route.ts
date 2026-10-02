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
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { geocodeCity } from '@/lib/server/geocode';
import { classifySource } from '@/lib/server/analytics/classify-source';
import { getPublicListing } from '@/lib/server/public/listing';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const location = await geocodeCity(listing.city, listing.country).catch(() => null);

    return NextResponse.json(
      { ...listing, viewCount, location },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
