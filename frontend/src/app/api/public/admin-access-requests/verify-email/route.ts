// ADMIN-ACCESS-REQUEST-02 — POST /api/public/admin-access-requests/verify-email
//
// Consumes the code from ADMIN-ACCESS-REQUEST-01: PENDING_EMAIL ->
// PENDING_REVIEW. No cookies issued — no User exists yet. Enumeration-
// resistant like /api/auth/verify-email: unknown email / wrong code /
// expired code all surface as the same VERIFICATION_CODE_INVALID.
// Brute-force protection is the per-email rate limiter only (5 / 15min) —
// same as the real verify-email route, which never actually reads/writes
// VerificationCode.attempts despite the column existing.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { VERIFICATION_CODE_REGEX, timingSafeCompare } from '@/lib/server/auth';

const Body = z.object({
  email: zEmail,
  code: z.string().regex(VERIFICATION_CODE_REGEX, 'Invalid verification code format'),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'admin-access-request-verify',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_ACCESS_REQUEST_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_VERIFY_ATTEMPTS',
  message: 'Too many verification attempts. Try again later.',
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
    const { email, code } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const invalid = () =>
      NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );

    const row = await prisma.adminAccessRequest.findFirst({
      where: { email, status: 'PENDING_EMAIL' },
      select: { id: true, verificationCode: true, verificationExpiresAt: true },
    });
    if (!row || !row.verificationCode || !row.verificationExpiresAt) return invalid();
    if (row.verificationExpiresAt.getTime() < Date.now()) return invalid();
    if (!timingSafeCompare(code, row.verificationCode)) return invalid();

    // TOCTOU-safe transition, mirrors /api/auth/verify-email's updateMany guard.
    const consumed = await prisma.adminAccessRequest.updateMany({
      where: { id: row.id, status: 'PENDING_EMAIL' },
      data: {
        status: 'PENDING_REVIEW',
        emailVerifiedAt: new Date(),
        verificationCode: null,
        verificationExpiresAt: null,
      },
    });
    if (consumed.count === 0) return invalid();

    try {
      const queue = getEmailQueue();
      if (queue) {
        const superadmins = await prisma.user.findMany({
          where: { role: 'SUPERADMIN' },
          select: { email: true },
        });
        await Promise.all(
          superadmins.map((s) =>
            queue.enqueue({
              to: s.email,
              subject: 'Nouvelle demande de compte administrateur',
              html: `<p>Une nouvelle demande d'accès administrateur (${email}) attend votre validation dans le tableau de bord admin.</p>`,
              text: `Une nouvelle demande d'accès administrateur (${email}) attend votre validation.`,
            }),
          ),
        );
      }
    } catch (err) {
      log.warn('admin-access-request verify: superadmin notify failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log.info('admin-access-request email verified');
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
