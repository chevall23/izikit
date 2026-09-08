// ADMIN-REQUESTS-04 — POST /api/admin/property-requests/bulk
//
// Bulk "transmit" (→ EN_COURS + re-run sector-alert matching) or "archive"
// (→ CLOTUREE) over a set of request ids. Each row is processed
// independently — one failing row never aborts the batch. One audit row
// for the whole batch. Mirrors POST /api/admin/listings/bulk.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewRequest } from '@/lib/server/alerts/matching';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

const Body = z.object({
  action: z.enum(['transmit', 'archive']),
  ids: z.array(z.string().min(1)).min(1).max(100),
});

const ROW_SELECT = {
  id: true,
  userId: true,
  status: true,
  transactionType: true,
  propertyType: true,
  country: true,
  city: true,
  budgetMin: true,
  budgetMax: true,
  clientName: true,
} as const;

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
    const targetStatus = action === 'transmit' ? 'EN_COURS' : 'CLOTUREE';

    const rows = await prisma.propertyRequest.findMany({
      where: { id: { in: ids } },
      select: ROW_SELECT,
    });
    const found = new Set(rows.map((r) => r.id));
    const skipped = ids.filter((id) => !found.has(id));

    const ok: string[] = [];
    const failed: string[] = [];
    let notifiedAgents = 0;

    for (const row of rows) {
      try {
        if (row.status !== targetStatus) {
          await prisma.propertyRequest.update({
            where: { id: row.id },
            data: { status: targetStatus },
          });
        }
        if (action === 'transmit') {
          try {
            notifiedAgents += await runMatchingForNewRequest(prisma, {
              id: row.id,
              userId: row.userId,
              transactionType: row.transactionType,
              propertyType: row.propertyType,
              country: row.country,
              city: row.city,
              budgetMin: row.budgetMin,
              budgetMax: row.budgetMax,
              clientName: row.clientName,
            });
          } catch (err) {
            log.warn('admin property-request bulk: rematch failed for a row', {
              requestId: row.id,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
        ok.push(row.id);
      } catch (err) {
        failed.push(row.id);
        log.warn('admin property-request bulk: row failed', {
          requestId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: `property_request.bulk-${action}`,
      targetType: 'PropertyRequest',
      metadata: {
        requested: ids.length,
        ok: ok.length,
        failed,
        skipped,
        ...(action === 'transmit' ? { notifiedAgents } : {}),
      },
    });

    return NextResponse.json(
      { ok, failed, skipped, ...(action === 'transmit' ? { notifiedAgents } : {}) },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
