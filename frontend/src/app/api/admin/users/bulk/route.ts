// ADMIN-USERS-05 — POST /api/admin/users/bulk
// Bulk suspend / activate. One audit row for the whole batch. Mirrors
// admin/listings/bulk's shape (ok[] + skipped[] discriminated result) and
// reuses the same guards as PATCH /[id]/status: restoring (SUSPENDED →
// ACTIVE) requires SUPERADMIN, and suspending a SUPERADMIN target requires
// a SUPERADMIN actor (CR-01 in [id]/status/route.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  action: z.enum(['suspend', 'activate']),
  ids: z.array(z.string().min(1)).min(1).max(100),
  reason: z.string().trim().min(1).max(500).optional(),
});

interface Skip {
  id: string;
  reason: 'NOT_FOUND' | 'RESTORE_REQUIRES_SUPERADMIN' | 'SUSPEND_REQUIRES_SUPERADMIN';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const targetStatus = parsed.data.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
    const ok: string[] = [];
    const skipped: Skip[] = [];

    // Sequential, not Promise.all — bulk actions can hit the ~100-row cap
    // and each mutation is its own tiny transaction; keeping it simple and
    // predictable beats parallel writes racing on the same table here.
    for (const id of parsed.data.ids) {
      const result = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id },
          select: { id: true, status: true, role: true },
        });
        if (!target) return { kind: 'NOT_FOUND' as const };
        if (target.status === targetStatus) return { kind: 'OK' as const };

        const isRestore = target.status === 'SUSPENDED' && targetStatus === 'ACTIVE';
        if (isRestore && auth.admin.role !== 'SUPERADMIN') {
          return { kind: 'RESTORE_REQUIRES_SUPERADMIN' as const };
        }
        const isSuspend = target.status === 'ACTIVE' && targetStatus === 'SUSPENDED';
        if (isSuspend && target.role === 'SUPERADMIN' && auth.admin.role !== 'SUPERADMIN') {
          return { kind: 'SUSPEND_REQUIRES_SUPERADMIN' as const };
        }

        await tx.user.update({ where: { id }, data: { status: targetStatus } });
        return { kind: 'OK' as const };
      });

      if (result.kind === 'OK') ok.push(id);
      else skipped.push({ id, reason: result.kind });
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: `user.bulk-${parsed.data.action}`,
      targetType: 'User',
      metadata: {
        requested: parsed.data.ids.length,
        ok: ok.length,
        skipped,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
      },
    });

    return NextResponse.json({ ok, skipped }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
