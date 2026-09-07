// ADMIN-LISTINGS-04 — POST /api/admin/listings/[id]/reject
// PENDING | VERIFIED | REJECTED  ->  REJECTED + rejectionReason.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
  rejectListing,
  ModerationError,
  asModerationClient,
} from '@/lib/server/listings/moderation';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ reason: z.string().trim().min(3).max(500) });

const ERR_STATUS: Record<string, number> = {
  LISTING_NOT_FOUND: 404,
  LISTING_NOT_MODERATABLE: 409,
  REASON_REQUIRED: 400,
};

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
        { error: 'VALIDATION_FAILED', message: 'A reason of 3-500 characters is required' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const before = await prisma.listing.findUnique({ where: { id }, select: { status: true } });

    let listing;
    try {
      listing = await rejectListing(asModerationClient(prisma), {
        id,
        adminId: auth.admin.id,
        reason: parsed.data.reason,
      });
    } catch (err) {
      if (err instanceof ModerationError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: ERR_STATUS[err.code] ?? 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing.reject',
      targetType: 'Listing',
      targetId: id,
      metadata: { from: before?.status ?? null, reason: parsed.data.reason },
    });

    return NextResponse.json({ listing }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
