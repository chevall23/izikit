// ADMIN-LISTING-REPORTS-05 — GET /api/admin/listing-reports/export
// Same filters as the list route, no pagination, hard cap 5000 rows.
// Mirrors admin/listings/export and admin/users/export.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildReportFilterWhere } from '../_filters';
import { reportSeverity } from '@/lib/server/reports/severity';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: Date;
  listing: { id: string; title: string; city: string; country: string } | null;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'reason', value: (r) => r.reason },
  { header: 'severity', value: (r) => reportSeverity(r.reason) },
  { header: 'status', value: (r) => r.status },
  { header: 'detail', value: (r) => r.detail ?? '' },
  { header: 'listingId', value: (r) => r.listing?.id ?? '' },
  { header: 'listingTitle', value: (r) => r.listing?.title ?? '' },
  { header: 'city', value: (r) => r.listing?.city ?? '' },
  { header: 'country', value: (r) => r.listing?.country ?? '' },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const where = buildReportFilterWhere(req.nextUrl.searchParams);
    const rows = (await prisma.listingReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        reason: true,
        detail: true,
        status: true,
        createdAt: true,
        listing: { select: { id: true, title: true, city: true, country: true } },
      },
    })) as ExportRow[];

    const csv = toCsv(rows, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing-report.export',
      targetType: 'ListingReport',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="signalements-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
