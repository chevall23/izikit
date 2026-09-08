// ADMIN-ALERTS-04 — GET /api/admin/alerts/export
// Same filters as the list route, no pagination, hard cap 5000 rows.
// Mirrors GET /api/admin/property-requests/export.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildAlertFilterWhere } from '../_filters';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  name: string;
  active: boolean;
  transactionType: string;
  propertyTypes: unknown;
  country: string;
  cities: unknown;
  priceMin: number | null;
  priceMax: number | null;
  frequency: string;
  notifEmail: boolean;
  notifSms: boolean;
  notifWhatsapp: boolean;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
  _count: { matches: number };
}

const joinArr = (v: unknown) => (Array.isArray(v) ? v.join(' | ') : '');

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'name', value: (r) => r.name },
  { header: 'active', value: (r) => (r.active ? 'true' : 'false') },
  { header: 'transactionType', value: (r) => r.transactionType },
  { header: 'propertyTypes', value: (r) => joinArr(r.propertyTypes) },
  { header: 'country', value: (r) => r.country },
  { header: 'cities', value: (r) => joinArr(r.cities) },
  { header: 'priceMin', value: (r) => r.priceMin ?? '' },
  { header: 'priceMax', value: (r) => r.priceMax ?? '' },
  { header: 'frequency', value: (r) => r.frequency },
  { header: 'notifEmail', value: (r) => (r.notifEmail ? 'true' : 'false') },
  { header: 'notifSms', value: (r) => (r.notifSms ? 'true' : 'false') },
  { header: 'notifWhatsapp', value: (r) => (r.notifWhatsapp ? 'true' : 'false') },
  { header: 'matchCount', value: (r) => r._count.matches },
  { header: 'ownerName', value: (r) => r.user?.name ?? '' },
  { header: 'ownerEmail', value: (r) => r.user?.email ?? '' },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const where = buildAlertFilterWhere(req.nextUrl.searchParams);
    const rows = (await prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        name: true,
        active: true,
        transactionType: true,
        propertyTypes: true,
        country: true,
        cities: true,
        priceMin: true,
        priceMax: true,
        frequency: true,
        notifEmail: true,
        notifSms: true,
        notifWhatsapp: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        _count: { select: { matches: true } },
      },
    })) as ExportRow[];

    const csv = toCsv(rows, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'alert.export',
      targetType: 'Alert',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="alertes-secteur-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
