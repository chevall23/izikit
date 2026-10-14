// LEADS-03 — GET /api/leads/purchased
//
// The agent's purchased leads, with the contact details for the active ones.
// Refunded purchases are listed without any contact data.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  AGENT_ONLY_BODY,
  PREVIEW_SELECT,
  REPORT_WINDOW_MS,
  contactOf,
  isAgent,
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

    const purchases = await prisma.leadPurchase.findMany({
      where: { agentId },
      select: {
        id: true,
        requestId: true,
        status: true,
        tokensSpent: true,
        createdAt: true,
        request: {
          select: {
            ...PREVIEW_SELECT,
            clientName: true,
            clientPhone: true,
            clientEmail: true,
            clientType: true,
            notes: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const now = Date.now();
    const items = purchases.map((p) => {
      const refunded = p.status === 'REFUNDED';
      const { clientName, clientPhone, clientEmail, clientType, notes, ...preview } = p.request;
      return {
        purchaseId: p.id,
        requestId: p.requestId,
        purchasedAt: p.createdAt,
        tokensSpent: p.tokensSpent,
        refunded,
        canReport: !refunded && now - p.createdAt.getTime() <= REPORT_WINDOW_MS,
        request: preview,
        ...(refunded
          ? {}
          : { contact: contactOf({ clientName, clientPhone, clientEmail, clientType, notes }) }),
      };
    });

    return NextResponse.json({ items }, { headers });
  });
}
