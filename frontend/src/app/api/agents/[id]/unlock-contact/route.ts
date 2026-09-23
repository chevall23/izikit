// AGENT-CONTACT-01 — POST /api/agents/[id]/unlock-contact
//
// Spends 1 token to reveal an agent's phone/WhatsApp contact on the public
// "/agents/[id]" profile (frontend/src/app/agents/[id]/page.tsx). Idempotent
// on two fronts, both returning 200 without touching the wallet:
//   - the caller IS the agent (viewing their own profile never costs a token)
//   - an AgentContactUnlock row already exists for (userId, agentId) — the
//     unlock is permanent, so revisiting never re-charges
// Otherwise: 422 INSUFFICIENT_TOKENS if the wallet can't cover 1 token
// (mirrors POST /api/legal-documents/submit's balance-check-before-charge
// posture), else debit 1 token + record the unlock in one transaction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const UNLOCK_COST_TOKENS = 1;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: agentId } = await ctx.params;

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, accountType: true },
    });
    if (!agent || agent.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Free — viewing your own profile never costs a token.
    if (auth.user.sub === agentId) {
      return NextResponse.json(
        { unlocked: true, charged: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.agentContactUnlock.findUnique({
      where: { userId_agentId: { userId: auth.user.sub, agentId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { unlocked: true, charged: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const wallet = await prisma.tokenWallet.findUnique({
      where: { userId: auth.user.sub },
      select: { balance: true },
    });
    if (!wallet || wallet.balance < UNLOCK_COST_TOKENS) {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_TOKENS',
          message: 'Not enough tokens to unlock this contact',
          required: UNLOCK_COST_TOKENS,
          balance: wallet?.balance ?? 0,
        },
        { status: 422, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.tokenWallet.update({
        where: { userId: auth.user.sub },
        data: { balance: { decrement: UNLOCK_COST_TOKENS } },
        select: { balance: true },
      });
      await tx.tokenTransaction.create({
        data: {
          userId: auth.user.sub,
          type: 'USAGE',
          amount: -UNLOCK_COST_TOKENS,
          balanceAfter: updatedWallet.balance,
          description: 'Déblocage du contact agent',
        },
      });
      await tx.agentContactUnlock.create({
        data: { userId: auth.user.sub, agentId },
      });
    });

    return NextResponse.json(
      { unlocked: true, charged: true },
      { status: 201, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
