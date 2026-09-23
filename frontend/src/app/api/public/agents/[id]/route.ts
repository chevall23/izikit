// PUBLIC-AGENT-DETAIL-01 — GET /api/public/agents/[id]
//
// Unauthenticated, read-only single-agent profile for the public
// "/agents/[id]" page. Same no-auth pattern as GET /api/public/agents.
// 404s for any user id that is not accountType=OWNER_AGENT, so this route
// never leaks the existence of a TENANT_BUYER account. Only VERIFIED
// listings are ever shown in the agent's portfolio.
//
// AGENT-CONTACT-01 — paid contact reveal. `phone` is only included in the
// response when the caller has unlocked this agent's contact (see POST
// /api/agents/[id]/unlock-contact) — free for the agent viewing their own
// profile, otherwise `null` + `contactUnlocked: false` until they pay.
// Auth is optional here (optionalAuth, not requireAuth): logged-out
// visitors still get the full profile, just without a phone.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { optionalAuth } from '@/lib/server/middleware';
import { LEGAL_DOCUMENT_TYPE_COUNT } from '@/lib/server/users/enrich';

const RECENT_LISTINGS_LIMIT = 6;

const LISTING_SELECT = {
  id: true,
  title: true,
  city: true,
  country: true,
  propertyType: true,
  transactionType: true,
  price: true,
  currency: true,
  bedrooms: true,
  bathrooms: true,
  surfaceM2: true,
  createdAt: true,
  photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
} as const;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { id } = await ctx.params;

    const agent = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        city: true,
        country: true,
        bio: true,
        phone: true,
        accountType: true,
        createdAt: true,
      },
    });

    if (!agent || agent.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const viewer = await optionalAuth(req.headers.get('authorization'));
    const isSelf = viewer?.user.sub === agent.id;
    const contactUnlocked =
      isSelf ||
      (viewer
        ? (await prisma.agentContactUnlock.findUnique({
            where: { userId_agentId: { userId: viewer.user.sub, agentId: agent.id } },
            select: { id: true },
          })) !== null
        : false);

    const [
      listings,
      activeCount,
      soldCount,
      verifiedDocCount,
      propertyTypes,
      transactionTypes,
      reviewCount,
      reviewAggregate,
    ] = await Promise.all([
      prisma.listing.findMany({
        where: { userId: id, status: 'VERIFIED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_LISTINGS_LIMIT,
        select: LISTING_SELECT,
      }),
      prisma.listing.count({ where: { userId: id, status: 'VERIFIED' } }),
      prisma.listing.count({ where: { userId: id, status: 'SOLD' } }),
      prisma.legalDocument.count({ where: { userId: id, status: 'VERIFIED' } }),
      prisma.listing.groupBy({
        by: ['propertyType'],
        where: { userId: id, status: { in: ['VERIFIED', 'SOLD'] } },
        _count: { _all: true },
      }),
      prisma.listing.groupBy({
        by: ['transactionType'],
        where: { userId: id, status: { in: ['VERIFIED', 'SOLD'] } },
        _count: { _all: true },
      }),
      prisma.agentReview.count({ where: { agentId: id } }),
      prisma.agentReview.aggregate({ where: { agentId: id }, _avg: { rating: true } }),
    ]);

    return NextResponse.json(
      {
        id: agent.id,
        name: agent.name,
        avatarUrl: agent.avatarUrl,
        city: agent.city,
        country: agent.country,
        bio: agent.bio,
        phone: contactUnlocked ? agent.phone : null,
        contactUnlocked,
        createdAt: agent.createdAt,
        stats: {
          activeListings: activeCount,
          soldListings: soldCount,
          verifiedDocCount,
          verifiedDocTotal: LEGAL_DOCUMENT_TYPE_COUNT,
          reviewCount,
          ratingAvg: reviewAggregate._avg.rating,
        },
        specialties: {
          propertyTypes: propertyTypes.map((r) => r.propertyType),
          transactionTypes: transactionTypes.map((r) => r.transactionType),
        },
        listings: listings.map((l) => ({
          id: l.id,
          title: l.title,
          city: l.city,
          country: l.country,
          propertyType: l.propertyType,
          transactionType: l.transactionType,
          price: l.price,
          currency: l.currency,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          surfaceM2: l.surfaceM2,
          createdAt: l.createdAt,
          primaryPhotoUrl: l.photos[0]?.url ?? null,
        })),
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
