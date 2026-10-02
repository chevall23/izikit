// PUBLIC-LISTINGS-01 — GET /api/public/listings
//
// Unauthenticated, read-only listing browse for the public "/annonces"
// marketing page. Mirrors the no-auth pattern of api/health/route.ts —
// there is no requireAuth() call here on purpose. Only VERIFIED listings
// are ever returned (never DRAFT/PENDING/SOLD). Query parsing and the query
// itself live in lib/server/public/listings.ts, shared with the
// server-rendered page.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { parseListingSearch, searchPublicListings } from '@/lib/server/public/listings';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const result = await searchPublicListings(parseListingSearch(req.nextUrl.searchParams));
    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
