// ADMIN-LISTING-REPORTS-03 — POST /api/admin/listing-reports/[id]/notes
//
// Adds an internal note to a report's processing history. Notes have no
// dedicated table — they're an AdminAction row (action:
// 'listing-report.note', metadata: { note }) on the same targetType/
// targetId as the resolve action, so GET .../[id]'s history assembly
// picks them up for free.
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
  note: z.string().trim().min(1).max(1000),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'A note of 1-1000 characters is required' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.listingReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'REPORT_NOT_FOUND', message: 'Report not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing-report.note',
      targetType: 'ListingReport',
      targetId: id,
      metadata: { note: parsed.data.note },
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
