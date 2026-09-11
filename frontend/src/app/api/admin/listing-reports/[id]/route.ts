// ADMIN-LISTING-REPORTS-02 — GET + PATCH /api/admin/listing-reports/[id]
//
// GET: full detail for the /admin/support drawer — the report, the
// reported listing (+ owner, for the "Suspendre l'annonce/l'utilisateur"
// buttons which call the existing /api/admin/listings/[id]/reject and
// /api/admin/users/[id]/status routes), and a processing history. There's
// no dedicated history table — AdminAction (targetType='ListingReport')
// already records every resolve + note action with actor/time, so the
// timeline is assembled from that plus a synthetic "received" entry.
//
// PATCH: resolves a report — REVIEWED (admin looked at it, no action
// needed beyond that) or DISMISSED (not actionable). Unlike
// /api/admin/users/[id]/status, there's no same-value no-op suppression
// — re-resolving a report (e.g. correcting a mistaken DISMISSED) is a
// legitimate action here, not audit-log noise.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { reportSeverity } from '@/lib/server/reports/severity';

const Body = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED']),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const report = await prisma.listingReport.findUnique({
      where: { id },
      select: {
        id: true,
        reason: true,
        detail: true,
        status: true,
        createdAt: true,
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            city: true,
            country: true,
            price: true,
            currency: true,
            photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!report) {
      return NextResponse.json(
        { error: 'REPORT_NOT_FOUND', message: 'Report not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const actions = await prisma.adminAction.findMany({
      where: { targetType: 'ListingReport', targetId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    });

    const history = [
      {
        id: 'received',
        kind: 'RECEIVED' as const,
        actor: null,
        metadata: null,
        createdAt: report.createdAt,
      },
      ...actions.map((a) => ({
        id: a.id,
        kind: (a.action === 'listing-report.note' ? 'NOTE' : 'STATUS_CHANGE') as
          | 'NOTE'
          | 'STATUS_CHANGE',
        actor: a.actor.name ?? a.actor.email,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
    ];

    return NextResponse.json(
      {
        report: {
          id: report.id,
          reason: report.reason,
          severity: reportSeverity(report.reason),
          detail: report.detail,
          status: report.status,
          createdAt: report.createdAt,
          listing: {
            id: report.listing.id,
            title: report.listing.title,
            status: report.listing.status,
            city: report.listing.city,
            country: report.listing.country,
            price: report.listing.price,
            currency: report.listing.currency,
            thumbnailUrl: report.listing.photos[0]?.url ?? null,
            owner: report.listing.user,
          },
        },
        history,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.listingReport.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'REPORT_NOT_FOUND', message: 'Report not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.listingReport.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing-report.resolve',
      targetType: 'ListingReport',
      targetId: id,
      metadata: { from: existing.status, to: parsed.data.status },
    });

    return NextResponse.json(
      { report: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
