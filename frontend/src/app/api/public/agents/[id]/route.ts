// PUBLIC-AGENT-DETAIL-01 — GET /api/public/agents/[id]
//
// Unauthenticated, read-only single-agent profile for the public
// "/agents/[id]" page. Same no-auth pattern as GET /api/public/agents.
// 404s for any user id that is not accountType=OWNER_AGENT, so this route
// never leaks the existence of a TENANT_BUYER account. Only VERIFIED
// listings are ever shown in the agent's portfolio. The profile itself is
// built by lib/server/public/agent.ts (shared with the server-rendered page).
//
// AGENT-CONTACT-01 — paid contact reveal. `phone` is only included in the
// response when the caller has unlocked this agent's contact (see POST
// /api/agents/[id]/unlock-contact) — free for the agent viewing their own
// profile, otherwise `null` + `contactUnlocked: false` until they pay.
// Auth is optional here (optionalAuth, not requireAuth): logged-out
// visitors still get the full profile, just without a phone.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { optionalAuth } from '@/lib/server/middleware';
import { loadPublicAgent } from '@/lib/server/public/agent';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { id } = await ctx.params;

    const loaded = await loadPublicAgent(id);
    if (!loaded) {
      return NextResponse.json(
        { error: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { profile } = loaded;

    const viewer = await optionalAuth(req.headers.get('authorization'));
    const isSelf = viewer?.user.sub === profile.id;
    const contactUnlocked =
      isSelf ||
      (viewer
        ? (await prisma.agentContactUnlock.findUnique({
            where: { userId_agentId: { userId: viewer.user.sub, agentId: profile.id } },
            select: { id: true },
          })) !== null
        : false);

    return NextResponse.json(
      { ...profile, phone: contactUnlocked ? loaded.phone : null, contactUnlocked },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
