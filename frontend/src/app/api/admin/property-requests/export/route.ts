// ADMIN-REQUESTS-03 — GET /api/admin/property-requests/export
// Same filters as the list route, no pagination, hard cap 5000 rows.
// Mirrors GET /api/admin/listings/export.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildRequestFilterWhere } from '../_filters';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  status: string;
  priority: string;
  transactionType: string;
  propertyType: string;
  city: string;
  country: string;
  landmark: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  financing: string;
  delay: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  source: string | null;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'status', value: (r) => r.status },
  { header: 'priority', value: (r) => r.priority },
  { header: 'transactionType', value: (r) => r.transactionType },
  { header: 'propertyType', value: (r) => r.propertyType },
  { header: 'city', value: (r) => r.city },
  { header: 'country', value: (r) => r.country },
  { header: 'landmark', value: (r) => r.landmark ?? '' },
  { header: 'budgetMin', value: (r) => r.budgetMin ?? '' },
  { header: 'budgetMax', value: (r) => r.budgetMax ?? '' },
  { header: 'financing', value: (r) => r.financing },
  { header: 'delay', value: (r) => r.delay },
  { header: 'clientName', value: (r) => r.clientName },
  { header: 'clientPhone', value: (r) => r.clientPhone },
  { header: 'clientEmail', value: (r) => r.clientEmail ?? '' },
  { header: 'clientType', value: (r) => r.clientType },
  { header: 'source', value: (r) => r.source ?? '' },
  { header: 'agentName', value: (r) => r.user?.name ?? '' },
  { header: 'agentEmail', value: (r) => r.user?.email ?? '' },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const where = buildRequestFilterWhere(req.nextUrl.searchParams);
    const rows = (await prisma.propertyRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        status: true,
        priority: true,
        transactionType: true,
        propertyType: true,
        city: true,
        country: true,
        landmark: true,
        budgetMin: true,
        budgetMax: true,
        financing: true,
        delay: true,
        clientName: true,
        clientPhone: true,
        clientEmail: true,
        clientType: true,
        source: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    })) as ExportRow[];

    const csv = toCsv(rows, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'property_request.export',
      targetType: 'PropertyRequest',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="demandes-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
