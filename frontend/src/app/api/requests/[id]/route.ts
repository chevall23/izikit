// REQUESTS-03 — GET /api/requests/[id]
//
// Single PropertyRequest detail (frontend/src/app/demandes/[id]/page.tsx).
// The owning agent sees the full request. So does an agent whose sector alert
// matched it (the eye icon on /alertes): product decision 2026-10-16, a match
// gives access to every field including the requester's contact details.
// Anyone else gets a 404 (not 403), same convention as GET /api/listings/[id].
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const REQUEST_SELECT = {
  id: true,
  userId: true,
  trustStatus: true,
  transactionType: true,
  propertyType: true,
  country: true,
  city: true,
  bedrooms: true,
  salons: true,
  surfaceM2: true,
  capacity: true,
  amenities: true,
  priority: true,
  budgetMin: true,
  budgetMax: true,
  financing: true,
  delay: true,
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  clientType: true,
  source: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const headers = { 'x-request-id': reqCtx.requestId };
    const notFound = () =>
      NextResponse.json(
        { error: 'REQUEST_NOT_FOUND', message: 'Property request not found' },
        { status: 404, headers },
      );

    const propertyRequest = await prisma.propertyRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    if (!propertyRequest) return notFound();

    if (propertyRequest.userId === auth.user.sub) {
      // trustStatus is read for the checks below, not part of the owner's payload.
      return NextResponse.json(
        { propertyRequest: omit(propertyRequest, 'trustStatus') },
        { status: 200, headers },
      );
    }

    // Not the owner: allowed only through a sector-alert match on a request the
    // admin review let through. Anyone else gets a 404 so existence is not leaked.
    if (propertyRequest.trustStatus !== 'TRUSTED') return notFound();
    const matched = await prisma.alertMatch.findFirst({
      where: { propertyRequestId: id, alert: { userId: auth.user.sub } },
      select: { id: true },
    });
    if (!matched) return notFound();

    // The owner's id is not shared with the matched agent.
    return NextResponse.json(
      { propertyRequest: omit(propertyRequest, 'userId', 'trustStatus') },
      { status: 200, headers },
    );
  });
}
