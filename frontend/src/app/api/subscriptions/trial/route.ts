// TRIAL-01 — POST /api/subscriptions/trial
//
// Starts the one-off 14-day Pro trial for an agent who was never subscribed.
// No payment, no tokens, no included boost: those are only granted by a paid
// order. Eligibility is re-read under the per-user listing-quota lock, the
// same lock that serialises publishing, payment grants and expiry.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { lockUserListingQuota, reactivateHiddenListings } from '@/lib/server/listings/quota';
import { TRIAL_DAYS_MS, isTrialEligible } from '@/lib/server/subscriptions/trial';
import { planMaxListings } from '@/lib/pricing';

class NotEligible extends Error {}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true },
    });
    if (user?.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_ONLY', message: 'Réservé aux comptes agent.' },
        { status: 403, headers },
      );
    }

    const pricing = await getPricing();

    try {
      const subscription = await prisma.$transaction(async (tx) => {
        await lockUserListingQuota(tx, userId);
        const existing = await tx.subscription.findUnique({
          where: { userId },
          select: { planKey: true, status: true, trialStartedAt: true },
        });
        if (!isTrialEligible(user.accountType, existing)) throw new NotEligible();

        const now = new Date();
        const currentPeriodEnd = new Date(now.getTime() + TRIAL_DAYS_MS);
        const sub = await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            planKey: 'PRO_AGENT',
            status: 'TRIAL',
            currentPeriodEnd,
            trialStartedAt: now,
          },
          update: {
            planKey: 'PRO_AGENT',
            status: 'TRIAL',
            currentPeriodEnd,
            trialStartedAt: now,
            canceledAt: null,
          },
          select: {
            planKey: true,
            status: true,
            currentPeriodEnd: true,
            canceledAt: true,
            trialStartedAt: true,
          },
        });
        await reactivateHiddenListings(tx, userId, planMaxListings(pricing, 'PRO_AGENT'));
        return sub;
      });

      return NextResponse.json({ subscription }, { status: 201, headers });
    } catch (err) {
      if (err instanceof NotEligible) {
        return NextResponse.json(
          { error: 'TRIAL_NOT_AVAILABLE', message: 'L’essai Pro n’est plus disponible.' },
          { status: 409, headers },
        );
      }
      throw err;
    }
  });
}
