// ADMIN-LISTINGS-06 — GET /api/admin/listings/export
// Same filters as the list route, no pagination, hard cap 5000 rows.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildListingFilterWhere } from '../_filters';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  title: string;
  status: string;
  transactionType: string;
  propertyType: string;
  city: string;
  country: string;
  price: number;
  currency: string;
  viewCount: number;
  createdAt: Date;
  moderatedAt: Date | null;
  rejectionReason: string | null;
  user: { name: string | null; email: string } | null;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'title', value: (r) => r.title },
  { header: 'status', value: (r) => r.status },
  { header: 'transactionType', value: (r) => r.transactionType },
  { header: 'propertyType', value: (r) => r.propertyType },
  { header: 'city', value: (r) => r.city },
  { header: 'country', value: (r) => r.country },
  { header: 'price', value: (r) => r.price },
  { header: 'currency', value: (r) => r.currency },
  { header: 'ownerName', value: (r) => r.user?.name ?? '' },
  { header: 'ownerEmail', value: (r) => r.user?.email ?? '' },
  { header: 'viewCount', value: (r) => r.viewCount },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
  { header: 'moderatedAt', value: (r) => r.moderatedAt?.toISOString() ?? '' },
  { header: 'rejectionReason', value: (r) => r.rejectionReason ?? '' },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const where = buildListingFilterWhere(req.nextUrl.searchParams);
    const rows = (await prisma.listing.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        title: true,
        status: true,
        transactionType: true,
        propertyType: true,
        city: true,
        country: true,
        price: true,
        currency: true,
        viewCount: true,
        createdAt: true,
        moderatedAt: true,
        rejectionReason: true,
        user: { select: { name: true, email: true } },
      },
    })) as ExportRow[];

    const csv = toCsv(rows, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing.export',
      targetType: 'Listing',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="annonces-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
