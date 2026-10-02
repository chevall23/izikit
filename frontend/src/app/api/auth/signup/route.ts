// AUTH-01 — POST /api/auth/signup
//
// New users get a User row (with name/phone/accountType from the Register
// screen), an EMAIL_VERIFY VerificationCode, and an outbox email event — all
// in one tx. An email or phone already linked to an account returns 409
// EMAIL_ALREADY_USED / PHONE_ALREADY_USED (deliberately NOT
// enumeration-resistant — see step 4).
//
// Login stays phone-based (see /api/auth/login), but verification is still
// by email — reuses the existing VerificationCode/outbox pipeline as-is
// rather than standing up a new SMS provider for this pass.
//
// CSRF carve-out: signup is a pre-session route — no CSRF cookie exists yet,
// so calling verifyCsrf would 403 every legitimate request. The CSRF cookie is
// set on session establishment (verify-email / login / refresh).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { hashPassword, generateVerificationCode } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { enqueueOutbox } from '@/lib/server/outbox';
import { nudgeOutbox } from '@/lib/server/outbox/nudge';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);
const VERIFICATION_TTL_MS = Number(process.env.AUTH_VERIFICATION_TTL_MIN ?? 15) * 60 * 1000;

const Body = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: zEmail,
  phone: zPhone,
  password: z.string().min(1),
  accountType: z.enum(['TENANT_BUYER', 'OWNER_AGENT']),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:signup',
  windowMs: 60 * 60 * 1000, // 1 hour (D-08)
  max: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_SIGNUP_ATTEMPTS',
  message: 'Too many signup attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // 1. Body parse + Zod validation.
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { firstName, lastName, email, phone, password, accountType } = parsed.data;

    // 2. Password policy gates BEFORE looking up user (D-22 — keep the no-user
    //    and existing-user branches symmetric below).
    //    Banned check runs before length so a common short password ("password")
    //    surfaces the more specific PASSWORD_BANNED code rather than TOO_SHORT.
    if (isBanned(password)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (password.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_PWNED',
          message: 'This password appeared in a known data breach.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 3. Per-email rate limit.
    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    // 4. Existing-email-or-phone branch — product decision (2026-10-02): tell
    //    the user which identifier is taken instead of a silent 201, which
    //    stranded them on /verify-email waiting for a code that never comes
    //    (notably owners of the ~1300 imported legacy accounts). Email wins
    //    when both match. The rate limiter above still caps probing.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { email: true, phone: true },
    });
    if (existing) {
      const emailTaken = existing.email === email;
      log.info('signup duplicate', { field: emailTaken ? 'email' : 'phone' });
      const res = NextResponse.json(
        emailTaken
          ? {
              error: 'EMAIL_ALREADY_USED',
              message: 'This email address is already linked to an account.',
            }
          : {
              error: 'PHONE_ALREADY_USED',
              message: 'This phone number is already linked to an account.',
            },
        { status: 409 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 5. New-user branch — hash + create User + VerificationCode + outbox.
    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          name: `${firstName} ${lastName}`.trim(),
          accountType,
        },
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: {
          userId: user.id,
          code,
          type: 'EMAIL_VERIFY',
          expiresAt,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.verification_code',
        payload: {
          to: email,
          code,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });
    // Fire-and-forget: send the code now instead of waiting ~10 min for the crons.
    void nudgeOutbox('signup');

    log.info('signup new user');
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
