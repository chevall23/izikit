// ADMIN-ACCESS-REQUEST-06 — POST /api/admin/access-requests/[id]/reject
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
});

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
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.adminAccessRequest.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ACCESS_REQUEST_NOT_FOUND', message: 'Access request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.adminAccessRequest.updateMany({
          where: { id, status: 'PENDING_REVIEW' },
          data: {
            status: 'REJECTED',
            reviewedByUserId: auth.admin.id,
            reviewedAt: new Date(),
            ...(parsed.data.reason !== undefined && { rejectionReason: parsed.data.reason }),
          },
        });
        if (updated.count === 0) {
          throw new Error('REQUEST_RACE');
        }
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'admin-access-request.reject',
          targetType: 'AdminAccessRequest',
          targetId: id,
          metadata: { email: existing.email, reason: parsed.data.reason ?? null },
        });
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

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: existing.email,
          subject: 'Votre demande de compte administrateur',
          html: `<p>Bonjour ${existing.name},</p><p>Votre demande d'accès administrateur n'a pas été retenue.${parsed.data.reason ? ` Motif : ${parsed.data.reason}` : ''}</p>`,
          text: `Votre demande d'accès administrateur n'a pas été retenue.${parsed.data.reason ? ` Motif : ${parsed.data.reason}` : ''}`,
        });
      }
    } catch (err) {
      log.warn('admin-access-request reject: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
