// POST /api/cron/request-feedback — sends the follow-up e-mail to requesters
// (first one a few days after the request, then weekly until they answer).
// Inert unless REQUEST_FEEDBACK_ENABLED=1.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { feedbackEnabled, sendDueFeedbackEmails } from '@/lib/server/requests/feedback';

const log = createLogger();
const LEASE_TTL_MS = 120_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result: unknown = { enabled: false };

    await withLease(redis ?? undefined, 'request-feedback', LEASE_TTL_MS, async () => {
      if (!feedbackEnabled()) return;
      result = await sendDueFeedbackEmails(prisma);
      log.info('request-feedback tick', { result, requestId: ctx.requestId });
    });

    return NextResponse.json({ ok: true, result }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export const GET = POST;
