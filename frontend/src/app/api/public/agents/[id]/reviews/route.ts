// PUBLIC-AGENT-REVIEWS-01 — GET /api/public/agents/[id]/reviews
//
// Unauthenticated, read-only reviews list for the "Avis clients" section on
// the public "/agents/[id]" page. Same no-auth pattern as the sibling agent
// detail route. Paginated (page/limit, same shape as /api/public/listings);
// also returns the aggregate avg/count so the page can render the rating
// summary without a second round trip. 404s when the target isn't an
// OWNER_AGENT, mirroring the agent detail route's existence-leak guard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parsePage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { id } = await ctx.params;

    const agent = await prisma.user.findUnique({
      where: { id },
      select: { id: true, accountType: true },
    });
    if (!agent || agent.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const params = req.nextUrl.searchParams;
    const page = parsePage(params.get('page'));
    const limit = parseLimit(params.get('limit'));

    const [rows, total, aggregate, ratingGroups] = await Promise.all([
      prisma.agentReview.findMany({
        where: { agentId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      prisma.agentReview.count({ where: { agentId: id } }),
      prisma.agentReview.aggregate({ where: { agentId: id }, _avg: { rating: true } }),
      prisma.agentReview.groupBy({
        by: ['rating'],
        where: { agentId: id },
        _count: { _all: true },
      }),
    ]);

    const ratingBreakdown: Record<'5' | '4' | '3' | '2' | '1', number> = {
      '5': 0,
      '4': 0,
      '3': 0,
      '2': 0,
      '1': 0,
    };
    for (const g of ratingGroups) {
      const key = String(g.rating) as keyof typeof ratingBreakdown;
      if (key in ratingBreakdown) ratingBreakdown[key] = g._count._all;
    }

    return NextResponse.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          author: r.author,
        })),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        avgRating: aggregate._avg.rating,
        ratingBreakdown,
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
