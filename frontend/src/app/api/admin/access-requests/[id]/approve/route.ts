// ADMIN-ACCESS-REQUEST-05 — POST /api/admin/access-requests/[id]/approve
//
// Only path in this feature that grants the ADMIN role — SUPERADMIN-only,
// consistent with "only SUPERADMIN can change roles". Creates the real
// User row from the request's stored passwordHash; no auto-login (this
// runs in the approving SUPERADMIN's own session).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.adminAccessRequest.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, passwordHash: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ACCESS_REQUEST_NOT_FOUND', message: 'Access request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (existing.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        { error: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email: existing.email },
      select: { id: true },
    });
    if (emailTaken) {
      return NextResponse.json(
        { error: 'EMAIL_ALREADY_REGISTERED', message: 'A user with this email already exists.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let createdUserId: string;
    try {
      createdUserId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: existing.email,
            phone: existing.phone,
            name: existing.name,
            passwordHash: existing.passwordHash,
            role: 'ADMIN',
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
        const updated = await tx.adminAccessRequest.updateMany({
          where: { id: existing.id, status: 'PENDING_REVIEW' },
          data: {
            status: 'APPROVED',
            reviewedByUserId: auth.admin.id,
            reviewedAt: new Date(),
            createdUserId: user.id,
          },
        });
        if (updated.count === 0) {
          throw new Error('REQUEST_RACE');
        }
        return user.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'REQUEST_RACE') {
        return NextResponse.json(
          { error: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' },
          { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin-access-request.approve',
      targetType: 'AdminAccessRequest',
      targetId: existing.id,
      metadata: { createdUserId, email: existing.email },
    });

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: existing.email,
          subject: 'Votre demande de compte administrateur est approuvée',
          html: `<p>Bonjour ${existing.name},</p><p>Votre demande d'accès administrateur a été approuvée. Vous pouvez maintenant vous connecter sur la page de connexion administrateur avec l'email et le mot de passe que vous avez fournis.</p>`,
          text: `Votre demande d'accès administrateur a été approuvée. Connectez-vous avec l'email et le mot de passe fournis.`,
        });
      }
    } catch (err) {
      log.warn('admin-access-request approve: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
