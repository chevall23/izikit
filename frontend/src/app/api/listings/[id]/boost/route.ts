// BOOST-01 — POST /api/listings/[id]/boost
//
// Boosts a VERIFIED listing for 7, 15 or 30 days: it is pinned at the top of
// page 1 of the public results (see lib/server/public/boosted.ts). Paid with
// tokens (priced in PricingConfig) or with one of the plan's included 7-day
// boosts. A boost on a still-running boost extends it, capped 60 days ahead.
// Everything runs in one transaction under a per-user advisory lock, modelled
// on POST /api/agents/[id]/unlock-contact.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { InsufficientTokensError, assertBalanceNotNegative } from '@/lib/server/token-wallet';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { boostTokenCost } from '@/lib/pricing';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HORIZON_MS = 60 * DAY_MS;

const Body = z.object({
  days: z.union([z.literal(7), z.literal(15), z.literal(30)]),
  useIncluded: z.boolean().optional(),
});

class BoostRefusal extends Error {
  constructor(
    readonly code: 'LISTING_NOT_BOOSTABLE' | 'NO_INCLUDED_BOOST' | 'BOOST_HORIZON',
    readonly httpMessage: string,
  ) {
    super(code);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.sub;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Durée de boost invalide.' },
        { status: 400, headers },
      );
    }
    const { days } = parsed.data;
    const useIncluded = parsed.data.useIncluded === true;
    if (useIncluded && days !== 7) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Le boost inclus vaut 7 jours.' },
        { status: 400, headers },
      );
    }

    const { id } = await ctx.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { userId: true, status: true, boostedUntil: true },
    });
    if (!listing || listing.userId !== userId) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' },
        { status: 404, headers },
      );
    }
    if (listing.status !== 'VERIFIED') {
      return NextResponse.json(
        {
          error: 'LISTING_NOT_BOOSTABLE',
          message: 'Seule une annonce vérifiée peut être boostée.',
        },
        { status: 409, headers },
      );
    }

    const cost = boostTokenCost(await getPricing(), days);
    if (!useIncluded) {
      const wallet = await prisma.tokenWallet.findUnique({
        where: { userId },
        select: { balance: true },
      });
      if (!wallet || wallet.balance < cost) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour ce boost.',
            required: cost,
            balance: wallet?.balance ?? 0,
          },
          { status: 422, headers },
        );
      }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `boost:${userId}`);

        // Re-read under the lock: the listing may have changed since the check above.
        const fresh = await tx.listing.findUnique({
          where: { id },
          select: { status: true, boostedUntil: true },
        });
        if (!fresh || fresh.status !== 'VERIFIED') {
          throw new BoostRefusal(
            'LISTING_NOT_BOOSTABLE',
            'Seule une annonce vérifiée peut être boostée.',
          );
        }
        const now = new Date();
        const startsAt =
          fresh.boostedUntil && fresh.boostedUntil.getTime() > now.getTime()
            ? fresh.boostedUntil
            : now;
        const endsAt = new Date(startsAt.getTime() + days * DAY_MS);
        if (endsAt.getTime() - now.getTime() > MAX_HORIZON_MS) {
          throw new BoostRefusal(
            'BOOST_HORIZON',
            'Un boost ne peut pas dépasser 60 jours à l’avance.',
          );
        }

        let tokensSpent = 0;
        if (useIncluded) {
          const consumed = await tx.subscription.updateMany({
            where: { userId, boostCredits: { gte: 1 } },
            data: { boostCredits: { decrement: 1 } },
          });
          if (consumed.count === 0) {
            throw new BoostRefusal('NO_INCLUDED_BOOST', 'Aucun boost inclus disponible.');
          }
        } else {
          const wallet = await tx.tokenWallet.update({
            where: { userId },
            data: { balance: { decrement: cost } },
            select: { balance: true },
          });
          // A concurrent spend may have passed the up-front check too.
          assertBalanceNotNegative(wallet);
          await tx.tokenTransaction.create({
            data: {
              userId,
              type: 'USAGE',
              amount: -cost,
              balanceAfter: wallet.balance,
              description: `Boost d'annonce — ${days} jours`,
            },
          });
          tokensSpent = cost;
        }

        const boost = await tx.boost.create({
          data: {
            listingId: id,
            userId,
            startsAt,
            endsAt,
            days,
            source: useIncluded ? 'INCLUDED' : 'TOKENS',
            tokensSpent,
          },
        });
        await tx.listing.update({ where: { id }, data: { boostedUntil: endsAt } });

        const walletNow = await tx.tokenWallet.findUnique({
          where: { userId },
          select: { balance: true },
        });
        const subNow = await tx.subscription.findUnique({
          where: { userId },
          select: { boostCredits: true },
        });
        return {
          boost,
          boostedUntil: endsAt,
          tokenBalance: walletNow?.balance ?? 0,
          boostCredits: subNow?.boostCredits ?? 0,
        };
      });

      return NextResponse.json(
        {
          boost: {
            id: result.boost.id,
            startsAt: result.boost.startsAt,
            endsAt: result.boost.endsAt,
            days: result.boost.days,
            source: result.boost.source,
            tokensSpent: result.boost.tokensSpent,
          },
          boostedUntil: result.boostedUntil,
          tokenBalance: result.tokenBalance,
          boostCredits: result.boostCredits,
        },
        { status: 201, headers },
      );
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour ce boost.',
            required: cost,
          },
          { status: 422, headers },
        );
      }
      if (err instanceof BoostRefusal) {
        return NextResponse.json(
          { error: err.code, message: err.httpMessage },
          { status: 409, headers },
        );
      }
      throw err;
    }
  });
}
