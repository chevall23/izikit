export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPricing } from '@/lib/server/pricing';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import {
  runSubscriptionLifecycle,
  type LifecycleResult,
} from '@/lib/server/subscriptions/lifecycle';

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result: LifecycleResult = { reminded: 0, graced: 0, expired: 0, hidden: 0 };

    await withLease(redis ?? undefined, 'subscription-lifecycle', LEASE_TTL_MS, async () => {
      result = await runSubscriptionLifecycle({ prisma, pricing: await getPricing() });
      log.info('subscription-lifecycle tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron invokes scheduled routes with GET, not POST.
export const GET = POST;
