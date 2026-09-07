// ADMIN-LISTINGS-05 — POST /api/admin/listings/bulk
// Bulk approve / reject / delete. One audit row for the whole batch.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
  bulkModerate,
  ModerationError,
  asModerationClient,
} from '@/lib/server/listings/moderation';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  action: z.enum(['approve', 'reject', 'delete']),
  ids: z.array(z.string().min(1)).min(1).max(100),
  reason: z.string().trim().min(3).max(500).optional(),
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

    let result;
    try {
      result = await bulkModerate(asModerationClient(prisma), {
        action: parsed.data.action,
        ids: parsed.data.ids,
        adminId: auth.admin.id,
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      });
    } catch (err) {
      if (err instanceof ModerationError && err.code === 'REASON_REQUIRED') {
        return NextResponse.json(
          { error: 'REASON_REQUIRED', message: 'A reason is required to reject listings' },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: `listing.bulk-${parsed.data.action}`,
      targetType: 'Listing',
      metadata: {
        requested: parsed.data.ids.length,
        ok: result.ok.length,
        skipped: result.skipped,
      },
    });

    return NextResponse.json(result, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
