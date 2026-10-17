// GET /api/subscriptions/me — /settings "Abonnement & paiement" tab.
//
// Absence of a Subscription row means "on the Free plan" (no row is ever
// created for a free user — same find-or-create-on-upgrade convention as
// Organization). Returns a default FREE/ACTIVE shape in that case so the
// frontend never has to special-case "no subscription yet".
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { planMaxPhotos } from '@/lib/pricing';
import { getEffectivePlanKey } from '@/lib/server/subscriptions/effective-plan';
import { isTrialEligible } from '@/lib/server/subscriptions/trial';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const row = await prisma.subscription.findUnique({
      where: { userId: auth.user.sub },
      select: {
        planKey: true,
        status: true,
        currentPeriodEnd: true,
        canceledAt: true,
        boostCredits: true,
        trialStartedAt: true,
      },
    });
    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { accountType: true },
    });

    const subscription = row ?? {
      planKey: 'FREE' as const,
      status: 'ACTIVE' as const,
      currentPeriodEnd: null,
      canceledAt: null,
      boostCredits: 0,
      trialStartedAt: null,
    };

    const effectivePlan = getEffectivePlanKey(row, new Date());
    const maxPhotosPerListing = planMaxPhotos(await getPricing(), effectivePlan);

    return NextResponse.json(
      {
        subscription,
        maxPhotosPerListing,
        trialEligible: isTrialEligible(
          user?.accountType,
          row
            ? { planKey: row.planKey, status: row.status, trialStartedAt: row.trialStartedAt }
            : null,
        ),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
