// ADMIN-01 — GET /api/admin/users/[id] (detail).
//
// Sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → prisma.user.findUnique with the same PII-safe
// USER_SELECT shape as the list endpoint, plus the relations the
// /admin/utilisateurs drawer needs (recent listings, LegalDocument KYC
// docs, token wallet, owned organization). 404 on miss with stable code
// USER_NOT_FOUND.
//
// "Conversion" (annonces → visites confirmées, 30j) is computed from real
// ListingView + Visit rows rather than stored — there's no persisted
// rating anywhere in this codebase (no review model exists), so `rating`
// stays `null` rather than being fabricated; the drawer renders "—" for it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  computeUserType,
  computeDisplayStatus,
  LEGAL_DOCUMENT_TYPE_COUNT,
} from '@/lib/server/users/enrich';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  phone: true,
  accountType: true,
  country: true,
  city: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  tokenWallet: { select: { balance: true } },
  ownedOrganizations: { select: { id: true, name: true } },
  legalDocuments: {
    select: { id: true, type: true, status: true, url: true, createdAt: true },
  },
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const [listings, listingIdRows] = await Promise.all([
      prisma.listing.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          city: true,
          price: true,
          currency: true,
          transactionType: true,
          status: true,
          photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      }),
      prisma.listing.findMany({ where: { userId: id }, select: { id: true } }),
    ]);

    const listingIds = listingIdRows.map((l) => l.id);
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const [viewCount, confirmedVisitCount] = listingIds.length
      ? await Promise.all([
          prisma.listingView.count({
            where: { listingId: { in: listingIds }, createdAt: { gte: since } },
          }),
          prisma.visit.count({
            where: {
              status: 'CONFIRMEE',
              createdAt: { gte: since },
              inquiry: { listingId: { in: listingIds } },
            },
          }),
        ])
      : [0, 0];

    const conversionRate = viewCount > 0 ? (confirmedVisitCount / viewCount) * 100 : null;

    const verifiedDocCount = user.legalDocuments.filter((d) => d.status === 'VERIFIED').length;

    const body = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      country: user.country,
      city: user.city,
      role: user.role,
      status: user.status,
      type: computeUserType({
        accountType: user.accountType,
        ownedOrgCount: user.ownedOrganizations.length,
      }),
      displayStatus: computeDisplayStatus({
        status: user.status,
        accountType: user.accountType,
        verifiedDocCount,
      }),
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      jetons: user.tokenWallet?.balance ?? 0,
      organization: user.ownedOrganizations[0] ?? null,
      kyc:
        user.accountType === 'OWNER_AGENT'
          ? {
              verified: verifiedDocCount >= LEGAL_DOCUMENT_TYPE_COUNT,
              verifiedDocCount,
              verifiedDocTotal: LEGAL_DOCUMENT_TYPE_COUNT,
              documents: user.legalDocuments.map((d) => ({
                id: d.id,
                type: d.type,
                status: d.status,
                url: d.url,
                createdAt: d.createdAt,
              })),
            }
          : null,
      rating: null as number | null, // no review/rating model exists in this codebase
      conversionRate,
      listings: listings.map((l) => ({
        id: l.id,
        title: l.title,
        city: l.city,
        price: l.price,
        currency: l.currency,
        transactionType: l.transactionType,
        status: l.status,
        thumbnailUrl: l.photos[0]?.url ?? null,
      })),
      listingCount: listingIds.length,
    };

    return NextResponse.json({ user: body }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
