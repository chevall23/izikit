// LEADS-04 — POST /api/leads/[id]/report
//
// "Numéro invalide" report. Refunds the purchase automatically when it is
// within 72h and the agent has fewer than 2 refunds over the last 30 days,
// frees the slot and sends the request back to admin review. Idempotent.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  AGENT_ONLY_BODY,
  LEAD_REPORTED_FLAG,
  REFUND_CAP,
  REFUND_WINDOW_MS,
  REPORT_WINDOW_MS,
  isAgent,
} from '@/lib/server/leads';

const Body = z.object({ reason: z.literal('INVALID_NUMBER') });

class ReportRefusal extends Error {
  constructor(
    readonly code: 'PURCHASE_NOT_FOUND' | 'REPORT_WINDOW_CLOSED' | 'REFUND_LIMIT',
    readonly status: number,
    readonly httpMessage: string,
  ) {
    super(code);
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

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Motif de signalement invalide.' },
        { status: 400, headers },
      );
    }

    const { id } = await ctx.params;

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `lead:${id}`);
        // Serialises the 30-day cap of one agent across different requests.
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `leadrefund:${agentId}`,
        );

        const purchase = await tx.leadPurchase.findUnique({
          where: { requestId_agentId: { requestId: id, agentId } },
          select: { id: true, status: true, tokensSpent: true, createdAt: true },
        });
        if (!purchase) {
          throw new ReportRefusal('PURCHASE_NOT_FOUND', 404, 'Achat introuvable.');
        }
        if (purchase.status === 'REFUNDED') {
          return { alreadyRefunded: true as const };
        }

        const now = new Date();
        if (now.getTime() - purchase.createdAt.getTime() > REPORT_WINDOW_MS) {
          throw new ReportRefusal(
            'REPORT_WINDOW_CLOSED',
            409,
            'Le délai de signalement de 72 h est dépassé.',
          );
        }
        const recent = await tx.leadPurchase.count({
          where: {
            agentId,
            status: 'REFUNDED',
            refundedAt: { gte: new Date(now.getTime() - REFUND_WINDOW_MS) },
          },
        });
        if (recent >= REFUND_CAP) {
          throw new ReportRefusal(
            'REFUND_LIMIT',
            409,
            `Limite de ${REFUND_CAP} remboursements sur 30 jours atteinte.`,
          );
        }

        const flipped = await tx.leadPurchase.updateMany({
          where: { id: purchase.id, status: 'ACTIVE' },
          data: {
            status: 'REFUNDED',
            reportReason: 'INVALID_NUMBER',
            reportedAt: now,
            refundedAt: now,
          },
        });
        if (flipped.count === 0) return { alreadyRefunded: true as const };

        const wallet = await tx.tokenWallet.update({
          where: { userId: agentId },
          data: { balance: { increment: purchase.tokensSpent } },
          select: { balance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            userId: agentId,
            type: 'REFUND',
            amount: purchase.tokensSpent,
            balanceAfter: wallet.balance,
            description: 'Remboursement de lead',
          },
        });

        const request = await tx.propertyRequest.findUnique({
          where: { id },
          select: { trustStatus: true, trustFlags: true },
        });
        if (request?.trustStatus === 'TRUSTED') {
          const flags = Array.isArray(request.trustFlags)
            ? request.trustFlags.filter((f): f is string => typeof f === 'string')
            : [];
          await tx.propertyRequest.update({
            where: { id },
            data: {
              trustStatus: 'REVIEW',
              trustFlags: flags.includes(LEAD_REPORTED_FLAG)
                ? flags
                : [...flags, LEAD_REPORTED_FLAG],
            },
          });
        }

        return {
          alreadyRefunded: false as const,
          tokensRefunded: purchase.tokensSpent,
          tokenBalance: wallet.balance,
        };
      });

      return NextResponse.json(
        result.alreadyRefunded
          ? { refunded: true, alreadyRefunded: true }
          : {
              refunded: true,
              tokensRefunded: result.tokensRefunded,
              tokenBalance: result.tokenBalance,
            },
        { headers },
      );
    } catch (err) {
      if (err instanceof ReportRefusal) {
        return NextResponse.json(
          { error: err.code, message: err.httpMessage },
          { status: err.status, headers },
        );
      }
      throw err;
    }
  });
}
