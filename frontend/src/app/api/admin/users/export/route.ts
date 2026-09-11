// ADMIN-USERS-06 — GET /api/admin/users/export
// Same filters as the list route (plus an optional `ids` CSV param for
// exporting just the current bulk-selection), no pagination, hard cap
// 5000 rows. Mirrors admin/listings/export.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { toCsv, type CsvColumn } from '@/lib/server/csv';
import { buildUserFilterWhere } from '../_filters';
import { computeUserType, computeDisplayStatus } from '@/lib/server/users/enrich';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const MAX_ROWS = 5000;

interface ExportRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  accountType: string;
  role: string;
  status: string;
  country: string | null;
  city: string | null;
  createdAt: Date;
  _count: { listings: number; ownedOrganizations: number };
  tokenWallet: { balance: number } | null;
}

const COLUMNS: CsvColumn<ExportRow & { type: string; displayStatus: string }>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'name', value: (r) => r.name ?? '' },
  { header: 'email', value: (r) => r.email },
  { header: 'phone', value: (r) => r.phone ?? '' },
  { header: 'type', value: (r) => r.type },
  { header: 'role', value: (r) => r.role },
  { header: 'status', value: (r) => r.displayStatus },
  { header: 'country', value: (r) => r.country ?? '' },
  { header: 'city', value: (r) => r.city ?? '' },
  { header: 'annonces', value: (r) => r._count.listings },
  { header: 'jetons', value: (r) => r.tokenWallet?.balance ?? 0 },
  { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const idsParam = sp.get('ids');
    const ids = idsParam
      ? idsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_ROWS)
      : null;

    const where: Prisma.UserWhereInput = ids ? { id: { in: ids } } : buildUserFilterWhere(sp);

    const rows = (await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        accountType: true,
        role: true,
        status: true,
        country: true,
        city: true,
        createdAt: true,
        _count: { select: { listings: true, ownedOrganizations: true } },
        tokenWallet: { select: { balance: true } },
      },
    })) as ExportRow[];

    // Enriched (type/displayStatus) needs a verified-doc count per OWNER_AGENT
    // row — one groupBy for the whole export batch, same technique as the
    // list route and the public agent directory.
    const ownerAgentIds = rows.filter((r) => r.accountType === 'OWNER_AGENT').map((r) => r.id);
    const docCounts = ownerAgentIds.length
      ? await prisma.legalDocument.groupBy({
          by: ['userId'],
          where: { userId: { in: ownerAgentIds }, status: 'VERIFIED' },
          _count: { _all: true },
        })
      : [];
    const verifiedByUser = new Map(docCounts.map((r) => [r.userId, r._count._all]));

    const enriched = rows.map((r) => ({
      ...r,
      type: computeUserType({
        accountType: r.accountType,
        ownedOrgCount: r._count.ownedOrganizations,
      }),
      displayStatus: computeDisplayStatus({
        status: r.status,
        accountType: r.accountType,
        verifiedDocCount: verifiedByUser.get(r.id) ?? 0,
      }),
    }));

    const csv = toCsv(enriched, COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'user.export',
      targetType: 'User',
      metadata: { count: rows.length },
    });

    const headers: Record<string, string> = {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="utilisateurs-${today}.csv"`,
      'x-request-id': ctx.requestId,
    };
    if (rows.length >= MAX_ROWS) headers['x-export-truncated'] = 'true';

    return new NextResponse(csv, { status: 200, headers });
  });
}
