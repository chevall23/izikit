// ADMIN-CONTACT-MESSAGES-01 — GET /api/admin/contact-messages
//
// Moderation/review queue for /contact submissions (the public POST
// endpoint at /api/public/contact). Cursor pagination mirrors GET
// /api/admin/listing-reports's shared helpers. `status` filter is
// optional (omit to see every status); pass `?status=NEW` for the
// actionable queue. Consumed by /admin/support ("Support client" tab) —
// adds a `q` search + a `total` count for the numbered pagination + tab
// badge.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CONTACT_MESSAGE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  country: true,
  subject: true,
  message: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.ContactMessageSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const filterWhere: Prisma.ContactMessageWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    // AND-combine so the cursor's OR (createdAt keyset) can't overwrite the
    // filter's own `q` OR — see admin/listings' GET for the same pitfall.
    const where: Prisma.ContactMessageWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: CONTACT_MESSAGE_SELECT,
      }),
      prisma.contactMessage.count({ where: filterWhere }),
    ]);

    const page = buildPage(rows, limit);
    return NextResponse.json({ ...page, total }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
