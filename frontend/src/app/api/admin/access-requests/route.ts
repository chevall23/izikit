// ADMIN-ACCESS-REQUEST-03 — GET /api/admin/access-requests
//
// SUPERADMIN-only review queue. Defaults to the actionable PENDING_REVIEW
// status; pass ?status=APPROVED|REJECTED|PENDING_EMAIL for history views.
// Never selects passwordHash.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ACCESS_REQUEST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
} as const satisfies Prisma.AdminAccessRequestSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status') ?? 'PENDING_REVIEW';
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.AdminAccessRequestWhereInput = {
      status,
      ...cursorWhere(cursor),
    };

    const rows = await prisma.adminAccessRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ACCESS_REQUEST_SELECT,
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
