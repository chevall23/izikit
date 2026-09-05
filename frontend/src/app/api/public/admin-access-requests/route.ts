// ADMIN-ACCESS-REQUEST-01 — POST /api/public/admin-access-requests
//
// Public, unauthenticated: anyone can request an admin account. Creates a
// PENDING_EMAIL AdminAccessRequest — no User row exists yet, so this alone
// grants no access. Enumeration-resistant like /api/auth/signup: identical
// 201 whether the email is new or already claimed (by a User or another
// active request).
//
// CSRF carve-out: pre-session route, same reasoning as /api/auth/signup —
// no CSRF cookie exists yet.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { hashPassword, generateVerificationCode } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);
const VERIFICATION_TTL_MIN = Number(process.env.ADMIN_ACCESS_REQUEST_VERIFICATION_TTL_MIN ?? 15);
const VERIFICATION_TTL_MS = VERIFICATION_TTL_MIN * 60 * 1000;
const ACTIVE_STATUSES = ['PENDING_EMAIL', 'PENDING_REVIEW', 'APPROVED'];

const Body = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: zEmail,
  phone: zPhone,
  password: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'admin-access-request',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.ADMIN_ACCESS_REQUEST_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_ACCESS_REQUEST_ATTEMPTS',
  message: 'Too many requests. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, email, phone, password } = parsed.data;

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      return NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const [existingUser, existingRequest] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.adminAccessRequest.findFirst({
        where: { email, status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      }),
    ]);
    if (existingUser || existingRequest) {
      await dummyBcryptCompare(password);
      log.info('admin-access-request duplicate (enumeration-resist)');
      return NextResponse.json(
        { ok: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await prisma.adminAccessRequest.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        verificationCode: code,
        verificationExpiresAt: expiresAt,
      },
    });

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: email,
          subject: 'Confirmez votre demande de compte administrateur',
          html: `<p>Bonjour ${name},</p><p>Votre code de vérification est : <strong>${code}</strong></p><p>Ce code expire dans ${VERIFICATION_TTL_MIN} minutes.</p>`,
          text: `Votre code de vérification est : ${code} (expire dans ${VERIFICATION_TTL_MIN} minutes)`,
        });
      } else {
        log.warn('admin-access-request: email queue not configured, verification code not sent');
      }
    } catch (err) {
      log.warn('admin-access-request: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log.info('admin-access-request created');
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
