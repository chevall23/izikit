// ADMIN-FINANCES-02 — GET /api/admin/finances/transactions
//
// Cursor-paginated real transaction queue for /admin/finances (backed by
// Order — the only payment/revenue table this starter has). Deliberately
// separate from GET /api/admin/orders (Phase 3, unused by any page yet):
// that route's contract whitelists `metadata` OUT of its select on
// purpose (its own test asserts this), while this screen needs
// metadata.kind to derive the "type" column — so it gets its own route
// instead of loosening that other route's PII/size whitelist.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildTransactionFilterWhere } from './_filters';
import { orderKind } from '@/lib/server/finances/order-kind';

const TXN_SELECT = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  provider: true,
  paymentMethod: true,
  metadata: true,
  createdAt: true,
  paidAt: true,
  customerEmail: true,
  customerName: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const satisfies Prisma.OrderSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));

    const filterWhere = buildTransactionFilterWhere(sp);
    const listWhere: Prisma.OrderWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where: listWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: TXN_SELECT,
      }),
      // Total for the active tab's filter (not the cursor page) — drives
      // the numbered pagination control.
      prisma.order.count({ where: filterWhere }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = (page.items as typeof rows).map((r) => ({
      id: r.id,
      type: orderKind(r.metadata),
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      provider: r.provider,
      paymentMethod: r.paymentMethod,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      user: r.user
        ? { id: r.user.id, name: r.user.name, email: r.user.email, avatarUrl: r.user.avatarUrl }
        : r.customerEmail || r.customerName
          ? { id: null, name: r.customerName, email: r.customerEmail, avatarUrl: null }
          : null,
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, total },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
