// LEADS-01 — GET /api/leads
//
// Marketplace of public property requests (no account behind them) that agents
// can buy with tokens. Returns only what is visible BEFORE buying — never the
// contact details nor the free-text notes. Requests whose 3 slots are taken
// are hidden unless the agent already bought them.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildPage, clampLimit, cursorWhere, decodeCursor } from '@/lib/server/pagination/paginate';
import {
  AGENT_ONLY_BODY,
  MAX_BUYERS,
  PREVIEW_SELECT,
  isAgent,
  previewOf,
  sellableWhere,
} from '@/lib/server/leads';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const country = url.searchParams.get('country')?.trim();
    const city = url.searchParams.get('city')?.trim();

    const rows = await prisma.propertyRequest.findMany({
      where: {
        ...sellableWhere(),
        ...(country ? { country } : {}),
        ...(city ? { city } : {}),
        ...cursorWhere(cursor),
      },
      select: {
        ...PREVIEW_SELECT,
        _count: { select: { leadPurchases: { where: { status: 'ACTIVE' } } } },
        leadPurchases: { where: { agentId, status: 'ACTIVE' }, select: { id: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const pricing = await getPricing();
    const page = buildPage(rows, limit);
    const items = page.items
      .map((r) => ({
        row: r,
        active: r._count.leadPurchases,
        purchased: r.leadPurchases.length > 0,
      }))
      .filter((x) => x.purchased || x.active < MAX_BUYERS)
      .map((x) => previewOf(x.row, pricing, x.active, x.purchased));

    return NextResponse.json({ items, nextCursor: page.nextCursor }, { headers });
  });
}
