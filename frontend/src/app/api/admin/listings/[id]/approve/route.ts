// ADMIN-LISTINGS-03 — POST /api/admin/listings/[id]/approve
// PENDING | VERIFIED | REJECTED  ->  VERIFIED. Clears rejection metadata.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
  approveListing,
  ModerationError,
  asModerationClient,
} from '@/lib/server/listings/moderation';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ERR_STATUS: Record<string, number> = {
  LISTING_NOT_FOUND: 404,
  LISTING_NOT_MODERATABLE: 409,
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
    const before = await prisma.listing.findUnique({ where: { id }, select: { status: true } });

    let listing;
    try {
      listing = await approveListing(asModerationClient(prisma), { id, adminId: auth.admin.id });
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
      action: 'listing.approve',
      targetType: 'Listing',
      targetId: id,
      metadata: { from: before?.status },
    });

    return NextResponse.json({ listing }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
