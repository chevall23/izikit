// ADMIN-ALERTS-01 — GET /api/admin/alerts
//
// Filtered, cursor-paginated list of EVERY agent's sector alert for
// /admin/alerte-secteur. Mirrors GET /api/admin/property-requests:
// requireAdmin('ADMIN') → enforceAdminRateLimit → parse filters →
// findMany(take limit+1) → buildPage, plus a `counts` block
// { all, active, inactive } for the status tabs. No owner scope — the
// admin sees alerts across all agents. Empty result is 200 { items: [] }.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildAlertFilterWhere } from './_filters';

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

    // counts reflect every filter EXCEPT `active` (the tabs show the
    // active/inactive split of the otherwise-filtered set).
    const filterWhere = buildAlertFilterWhere(sp);
    const countsWhere: Prisma.AlertWhereInput = { ...filterWhere };
    delete (countsWhere as Record<string, unknown>).active;

    // AND-combine so the cursor's OR keyset can't overwrite a filter OR.
    const listWhere: Prisma.AlertWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, all, active, inactive] = await Promise.all([
      prisma.alert.findMany({
        where: listWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          name: true,
          transactionType: true,
          propertyTypes: true,
          country: true,
          cities: true,
          priceMin: true,
          priceMax: true,
          frequency: true,
          notifWhatsapp: true,
          notifEmail: true,
          notifSms: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          _count: { select: { matches: true } },
        },
      }),
      prisma.alert.count({ where: countsWhere }),
      prisma.alert.count({ where: { ...countsWhere, active: true } }),
      prisma.alert.count({ where: { ...countsWhere, active: false } }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = (page.items as typeof rows).map((r) => ({
      id: r.id,
      name: r.name,
      transactionType: r.transactionType,
      propertyTypes: Array.isArray(r.propertyTypes) ? r.propertyTypes : [],
      country: r.country,
      cities: Array.isArray(r.cities) ? r.cities : [],
      priceMin: r.priceMin,
      priceMax: r.priceMax,
      frequency: r.frequency,
      notifWhatsapp: r.notifWhatsapp,
      notifEmail: r.notifEmail,
      notifSms: r.notifSms,
      active: r.active,
      createdAt: r.createdAt,
      matchCount: r._count.matches,
      owner: r.user ? { id: r.user.id, name: r.user.name } : null,
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, counts: { all, active, inactive } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
