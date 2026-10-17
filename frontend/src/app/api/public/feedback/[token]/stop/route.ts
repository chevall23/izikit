// PUBLIC-FEEDBACK-03 — POST /api/public/feedback/[token]/stop
//
// Stops the weekly feedback reminders for this request. Triggered by the
// "ne plus recevoir ces rappels" button on /avis/<token>. POST (never GET):
// mail scanners prefetch links, and a prefetch must not unsubscribe anyone.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { optOutOfFeedback } from '@/lib/server/requests/feedback';

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'public-feedback-stop',
  windowMs: 60 * 60 * 1000,
  max: 20,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Try again later.',
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const limited = await limiter.check(req, null);
    if (limited) return limited;

    const { token } = await ctx.params;
    const found = await optOutOfFeedback(prisma, token);
    if (!found) {
      return NextResponse.json(
        { error: 'FEEDBACK_NOT_FOUND', message: 'Link not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
