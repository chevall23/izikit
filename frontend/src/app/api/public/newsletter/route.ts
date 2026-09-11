// PUBLIC-NEWSLETTER-01 — POST /api/public/newsletter
//
// Unauthenticated newsletter signup from the /blog sidebar. Idempotent
// upsert on email: re-subscribing an already-ACTIVE email is a no-op, and
// re-subscribing a previously UNSUBSCRIBED email flips it back to ACTIVE.
// Rate-limited per email (mirrors POST /api/auth/login's per-identifier
// limiter) rather than per-IP-only, since the identifying field (email)
// is known before the limiter check.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  email: z.string().trim().email().max(200),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'newsletter-subscribe',
  windowMs: 60 * 60 * 1000,
  max: 5,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Try again later.',
});

// IP-keyed limiter, checked BEFORE the per-email one. The email-keyed
// limiter alone gives every fresh email address its own bucket, so a
// script rotating email addresses from one IP is never rate-limited.
// This catches bulk-volume abuse from a single source; ceiling is more
// generous than the per-email cap since it's not meant to block normal
// single-user retries.
const ipLimiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'newsletter-subscribe-ip',
  windowMs: 60 * 60 * 1000,
  max: 20,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Try again later.',
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const email = parsed.data.email.trim().toLowerCase();

    const ipLimited = await ipLimiter.check(req, null);
    if (ipLimited) return ipLimited;

    const limited = await limiter.check(req, email);
    if (limited) return limited;

    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, status: 'ACTIVE' },
      update: { status: 'ACTIVE', unsubscribedAt: null },
      select: { id: true, email: true, status: true },
    });

    return NextResponse.json(
      { subscriber },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
