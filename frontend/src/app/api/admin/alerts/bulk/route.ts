// ADMIN-ALERTS-03 — POST /api/admin/alerts/bulk
//
// Bulk activate / deactivate / delete over a set of alert ids. Each row is
// processed independently — one failing row never aborts the batch. One
// audit row for the whole batch. Mirrors POST /api/admin/property-requests/bulk.
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
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

const Body = z.object({
  action: z.enum(['activate', 'deactivate', 'delete']),
  ids: z.array(z.string().min(1)).min(1).max(100),
});

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
    const { action, ids } = parsed.data;

    const rows = await prisma.alert.findMany({
      where: { id: { in: ids } },
      select: { id: true, active: true },
    });
    const found = new Set(rows.map((r) => r.id));
    const skipped = ids.filter((id) => !found.has(id));

    const ok: string[] = [];
    const failed: string[] = [];

    for (const row of rows) {
      try {
        if (action === 'delete') {
          await prisma.alert.delete({ where: { id: row.id } });
        } else {
          const next = action === 'activate';
          if (row.active !== next) {
            await prisma.alert.update({ where: { id: row.id }, data: { active: next } });
          }
        }
        ok.push(row.id);
      } catch (err) {
        failed.push(row.id);
        log.warn('admin alert bulk: row failed', {
          alertId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: `alert.bulk-${action}`,
      targetType: 'Alert',
      metadata: { requested: ids.length, ok: ok.length, failed, skipped },
    });

    return NextResponse.json(
      { ok, failed, skipped },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
