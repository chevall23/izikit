// ADMIN-LISTING-REPORTS-04 — GET /api/admin/listing-reports/stats
//
// KPI strip for /admin/support: pending queue size, resolved this week,
// average processing time. There's no `resolvedAt` column on
// ListingReport — processing time is derived from the AdminAction audit
// trail instead (each resolve writes a timestamped 'listing-report.resolve'
// row), so no schema change was needed to compute it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PROCESSING_TIME_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfWeek(now: Date): Date {
  // ISO week (Monday start), UTC.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const weekStart = startOfWeek(now);
    const lookbackStart = new Date(now.getTime() - PROCESSING_TIME_LOOKBACK_DAYS * MS_PER_DAY);

    const [pendingCount, resolvedThisWeek, resolveActions] = await Promise.all([
      prisma.listingReport.count({ where: { status: 'PENDING' } }),
      prisma.adminAction.count({
        where: {
          action: 'listing-report.resolve',
          targetType: 'ListingReport',
          createdAt: { gte: weekStart },
        },
      }),
      prisma.adminAction.findMany({
        where: {
          action: 'listing-report.resolve',
          targetType: 'ListingReport',
          createdAt: { gte: lookbackStart },
          targetId: { not: null },
        },
        select: { targetId: true, createdAt: true },
      }),
    ]);

    const reportIds = [
      ...new Set(resolveActions.map((a) => a.targetId).filter((id): id is string => id != null)),
    ];
    const reports = reportIds.length
      ? await prisma.listingReport.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, createdAt: true },
        })
      : [];
    const reportCreatedAtById = new Map(reports.map((r) => [r.id, r.createdAt]));

    // A report resolved more than once (dismissed then corrected, say)
    // contributes one duration per resolve action, each measured from the
    // report's own submission time — matches "how long was this open
    // before an admin acted", not just the final action.
    const durationsMs = resolveActions
      .map((a) => {
        const reportedAt = a.targetId ? reportCreatedAtById.get(a.targetId) : undefined;
        return reportedAt ? a.createdAt.getTime() - reportedAt.getTime() : null;
      })
      .filter((ms): ms is number => ms != null && ms >= 0);

    const avgProcessingTimeMs =
      durationsMs.length > 0
        ? Math.round(durationsMs.reduce((s, ms) => s + ms, 0) / durationsMs.length)
        : null;

    return NextResponse.json(
      { pendingCount, resolvedThisWeek, avgProcessingTimeMs },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
