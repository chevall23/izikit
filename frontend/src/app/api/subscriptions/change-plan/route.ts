// POST /api/subscriptions/change-plan — /settings "Abonnement & paiement".
//
// Only handles moves to the FREE plan (immediate, no charge). Moving to a
// paid plan is NOT done here — it goes through the existing, battle-tested
// `POST /api/orders` one-time-charge pipeline directly from the client
// (metadata.kind = "subscription_plan_change"), and the webhook activates
// the plan once Bictorys confirms payment (see
// frontend/src/app/api/webhooks/bictorys/route.ts). Keeping upgrades out of
// this route avoids a second, competing charge-creation path.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';
import { hideExcessListings, lockUserListingQuota } from '@/lib/server/listings/quota';
import { createLogger } from '@/lib/server/logger';
import { getPricing } from '@/lib/server/pricing';
import { planMaxListings } from '@/lib/pricing';
import { PLAN_KEYS } from '@/lib/subscription-plans';

const log = createLogger();

const Body = z.object({
  planKey: z.enum(PLAN_KEYS),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
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

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Only FREE may be set here, whatever the live price says (an admin-edited
    // price of 0 must never give a paid plan for free).
    if (parsed.data.planKey !== 'FREE') {
      return NextResponse.json(
        {
          error: 'UPGRADE_REQUIRES_PAYMENT',
          message: 'Upgrading to a paid plan requires a payment — use POST /api/orders',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pricing = await getPricing();

    // The downgrade and the hiding of excess public listings are one unit: if
    // hiding fails we must not leave a FREE account with more than the FREE
    // quota of public listings, so the error is surfaced as a 500 (rolled back).
    let subscription;
    try {
      subscription = await prisma.$transaction(async (tx) => {
        await lockUserListingQuota(tx, auth.user.sub);
        // An account that had a paid plan (or a trial, or already lapsed) goes
        // back to FREE as EXPIRED, like after a natural expiry — never as a
        // pristine FREE/ACTIVE row, which would make it eligible to the one-off
        // Pro trial again. Only a never-subscribed account stays ACTIVE.
        const previous = await tx.subscription.findUnique({
          where: { userId: auth.user.sub },
          select: { planKey: true, status: true },
        });
        const hadSubscription = previous
          ? previous.planKey !== 'FREE' || previous.status === 'EXPIRED'
          : false;
        const sub = await tx.subscription.upsert({
          where: { userId: auth.user.sub },
          create: { userId: auth.user.sub, planKey: 'FREE', status: 'ACTIVE' },
          update: {
            planKey: 'FREE',
            status: hadSubscription ? 'EXPIRED' : 'ACTIVE',
            currentPeriodEnd: null,
            canceledAt: null,
          },
          select: { planKey: true, status: true, currentPeriodEnd: true, canceledAt: true },
        });
        await hideExcessListings(tx, auth.user.sub, planMaxListings(pricing, 'FREE'));
        await lockUserAlertQuota(tx, auth.user.sub);
        await disableExcessAlerts(tx, auth.user.sub, pricing, 'FREE');
        return sub;
      });
    } catch (err) {
      log.error('change-plan downgrade failed', {
        requestId: ctx.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Could not change plan' },
        { status: 500, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { subscription },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
