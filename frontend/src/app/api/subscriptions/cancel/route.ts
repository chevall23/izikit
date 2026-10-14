// POST /api/subscriptions/cancel — /settings "Abonnement & paiement".
//
// Flips an active paid subscription to CANCELED. The plan stays effective until
// currentPeriodEnd (see lib/server/subscriptions/effective-plan.ts); the
// subscription-lifecycle cron then expires it without a grace period.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const existing = await prisma.subscription.findUnique({
      where: { userId: auth.user.sub },
      select: { planKey: true, status: true },
    });

    if (
      !existing ||
      existing.planKey === 'FREE' ||
      existing.status === 'CANCELED' ||
      existing.status === 'TRIAL'
    ) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_SUBSCRIPTION', message: 'No active paid subscription to cancel' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subscription = await prisma.subscription.update({
      where: { userId: auth.user.sub },
      data: { status: 'CANCELED', canceledAt: new Date() },
      select: { planKey: true, status: true, currentPeriodEnd: true, canceledAt: true },
    });

    return NextResponse.json(
      { subscription },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
