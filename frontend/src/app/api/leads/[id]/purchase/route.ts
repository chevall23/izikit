// LEADS-02 — POST /api/leads/[id]/purchase
//
// Buys the contact details of a public property request with tokens. One
// transaction under a per-request advisory lock so that the last free slot
// goes to a single agent. Modelled on POST /api/agents/[id]/unlock-contact.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { InsufficientTokensError, assertBalanceNotNegative } from '@/lib/server/token-wallet';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { leadTokenCost } from '@/lib/pricing';
import { AGENT_ONLY_BODY, MAX_BUYERS, contactOf, isAgent, isSellable } from '@/lib/server/leads';

class LeadRefusal extends Error {
  constructor(
    readonly code: 'LEAD_UNAVAILABLE' | 'LEAD_FULL',
    readonly httpMessage: string,
  ) {
    super(code);
  }
}

class PriceChanged extends Error {
  constructor(readonly price: number) {
    super('PRICE_CHANGED');
  }
}

class NotEnoughTokens extends Error {
  constructor(
    readonly required: number,
    readonly balance: number,
  ) {
    super('INSUFFICIENT_TOKENS');
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const { id } = await ctx.params;
    // The price the agent was shown. Optional: absent = accept the current price.
    const body = (await req.json().catch(() => null)) as { expectedPrice?: unknown } | null;
    const expectedPrice = typeof body?.expectedPrice === 'number' ? body.expectedPrice : null;
    const pricing = await getPricing();

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `lead:${id}`);

        const request = await tx.propertyRequest.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            trustStatus: true,
            status: true,
            source: true,
            createdAt: true,
            priority: true,
            city: true,
            clientName: true,
            clientPhone: true,
            clientEmail: true,
            clientType: true,
            notes: true,
          },
        });
        if (!request) {
          throw new LeadRefusal('LEAD_UNAVAILABLE', 'Cette demande n’est plus disponible.');
        }

        const existing = await tx.leadPurchase.findUnique({
          where: { requestId_agentId: { requestId: id, agentId } },
          select: { status: true },
        });
        if (existing?.status === 'ACTIVE') {
          const wallet = await tx.tokenWallet.findUnique({
            where: { userId: agentId },
            select: { balance: true },
          });
          return {
            contact: contactOf(request),
            tokenBalance: wallet?.balance ?? 0,
            charged: false,
          };
        }
        if (existing || !isSellable(request)) {
          throw new LeadRefusal('LEAD_UNAVAILABLE', 'Cette demande n’est plus disponible.');
        }

        const active = await tx.leadPurchase.count({
          where: { requestId: id, status: 'ACTIVE' },
        });
        if (active >= MAX_BUYERS) {
          throw new LeadRefusal('LEAD_FULL', 'Cette demande a déjà trouvé ses 3 agents.');
        }

        const cost = leadTokenCost(pricing, request.priority);
        if (expectedPrice !== null && expectedPrice !== cost) throw new PriceChanged(cost);
        const before = await tx.tokenWallet.findUnique({
          where: { userId: agentId },
          select: { balance: true },
        });
        if (!before || before.balance < cost) {
          throw new NotEnoughTokens(cost, before?.balance ?? 0);
        }

        const wallet = await tx.tokenWallet.update({
          where: { userId: agentId },
          data: { balance: { decrement: cost } },
          select: { balance: true },
        });
        assertBalanceNotNegative(wallet);
        await tx.tokenTransaction.create({
          data: {
            userId: agentId,
            type: 'USAGE',
            amount: -cost,
            balanceAfter: wallet.balance,
            description: `Achat de lead — ${request.city}`,
          },
        });
        await tx.leadPurchase.create({
          data: { requestId: id, agentId, tokensSpent: cost },
        });

        return { contact: contactOf(request), tokenBalance: wallet.balance, charged: true };
      });

      return NextResponse.json(result, { status: result.charged ? 201 : 200, headers });
    } catch (err) {
      if (err instanceof PriceChanged) {
        return NextResponse.json(
          {
            error: 'PRICE_CHANGED',
            message: 'Le prix de ce lead a changé. Rouvrez la fenêtre d’achat.',
            price: err.price,
          },
          { status: 409, headers },
        );
      }
      if (err instanceof NotEnoughTokens) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour acheter ce lead.',
            required: err.required,
            balance: err.balance,
          },
          { status: 422, headers },
        );
      }
      if (err instanceof InsufficientTokensError) {
        return NextResponse.json(
          { error: 'INSUFFICIENT_TOKENS', message: 'Pas assez de jetons pour acheter ce lead.' },
          { status: 422, headers },
        );
      }
      if (err instanceof LeadRefusal) {
        return NextResponse.json(
          { error: err.code, message: err.httpMessage },
          { status: 409, headers },
        );
      }
      throw err;
    }
  });
}
