// AGENT-REVIEWS-01 — POST /api/agents/[id]/reviews
//
// Creates or updates the current user's review of an agent ("Avis clients"
// form on /agents/[id]). Upsert on the (agentId, authorId) unique
// constraint — a user gets exactly one review per agent; resubmitting
// edits it in place rather than creating a duplicate. Published
// immediately, no moderation queue (v1 decision — see AgentReview schema
// comment). Refuses self-reviews and reviewing a non-agent target.
//
// AGENT-REVIEWS-02 — DELETE /api/agents/[id]/reviews
//
// Deletes the current user's own review of this agent, if any.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000),
});

async function findReviewableAgent(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, accountType: true },
  });
}

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

    if (agentId === auth.user.sub) {
      return NextResponse.json(
        { error: 'CANNOT_REVIEW_SELF', message: 'You cannot review yourself' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const agent = await findReviewableAgent(agentId);
    if (!agent || agent.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = ReviewBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const review = await prisma.agentReview.upsert({
      where: { agentId_authorId: { agentId, authorId: auth.user.sub } },
      create: {
        agentId,
        authorId: auth.user.sub,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      },
      update: {
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    return NextResponse.json(
      { review },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
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

    const existing = await prisma.agentReview.findUnique({
      where: { agentId_authorId: { agentId, authorId: auth.user.sub } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'REVIEW_NOT_FOUND', message: 'Review not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.agentReview.delete({ where: { id: existing.id } });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
