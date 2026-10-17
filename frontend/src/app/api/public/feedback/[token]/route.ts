// PUBLIC-FEEDBACK-01 — GET /api/public/feedback/[token]
//
// The requester's follow-up form (/avis/<token>). Unauthenticated: the
// 192-bit token in the e-mailed link is the secret. Returns just enough to
// render the form — a first name, the request summary and the agents the
// requester can rate — never contact details.
//
// PUBLIC-FEEDBACK-02 — POST /api/public/feedback/[token]
//
// Submits the answer ("was I contacted?" + one rating per agent + comment).
// Same pre-session carve-out as the other public forms: no CSRF, per-IP rate
// limit. The ratings become AgentReview rows (public agent profile).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { loadFeedbackForm, submitFeedback } from '@/lib/server/requests/feedback';

const Body = z.object({
  contacted: z.boolean(),
  ratings: z
    .array(z.object({ agentId: z.string().min(1).max(64), rating: z.number().int().min(1).max(5) }))
    .max(10)
    .default([]),
  comment: z.string().trim().max(1000).optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'public-feedback',
  windowMs: 60 * 60 * 1000,
  max: 20,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Try again later.',
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { token } = await ctx.params;
    const form = await loadFeedbackForm(prisma, token);
    if (!form) {
      return NextResponse.json(
        { error: 'FEEDBACK_NOT_FOUND', message: 'Link not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(form, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const limited = await limiter.check(req, null);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { token } = await ctx.params;
    const outcome = await submitFeedback(prisma, token, parsed.data);
    if (outcome.ok) {
      return NextResponse.json(
        { ok: true },
        { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const status =
      outcome.code === 'NOT_FOUND' ? 404 : outcome.code === 'ALREADY_SUBMITTED' ? 409 : 400;
    return NextResponse.json(
      { error: outcome.code, message: 'Feedback not accepted' },
      { status, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
