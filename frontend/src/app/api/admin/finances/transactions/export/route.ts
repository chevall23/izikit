// ADMIN-FINANCES-03 — GET /api/admin/finances/transactions/export
// Same filters as the list route, no pagination, hard cap 5000 rows.
// Mirrors admin/listings/export and admin/users/export.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildTransactionFilterWhere } from '../_filters';
import { orderKind } from '@/lib/server/finances/order-kind';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paymentMethod: string | null;
  metadata: unknown;
  createdAt: Date;
  paidAt: Date | null;
  customerEmail: string | null;
  user: { name: string | null; email: string } | null;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'type', value: (r) => orderKind(r.metadata) },
  { header: 'status', value: (r) => r.status },
  { header: 'amount', value: (r) => r.amount },
  { header: 'currency', value: (r) => r.currency },
  { header: 'provider', value: (r) => r.provider },
  { header: 'paymentMethod', value: (r) => r.paymentMethod ?? '' },
  { header: 'userName', value: (r) => r.user?.name ?? '' },
  { header: 'userEmail', value: (r) => r.user?.email ?? r.customerEmail ?? '' },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
  { header: 'paidAt', value: (r) => r.paidAt?.toISOString() ?? '' },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const where = buildTransactionFilterWhere(req.nextUrl.searchParams);
    const rows = (await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
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
        user: { select: { name: true, email: true } },
      },
    })) as ExportRow[];

    const csv = toCsv(rows, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'finances.transactions.export',
      targetType: 'Order',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="transactions-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
