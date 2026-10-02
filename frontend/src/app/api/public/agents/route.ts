// PUBLIC-AGENTS-01 — GET /api/public/agents
//
// Unauthenticated, read-only agent directory for the public "/agents"
// marketing page. Mirrors the no-auth pattern of api/public/listings —
// there is no requireAuth() call here on purpose. An "agent" is any User
// with accountType=OWNER_AGENT, regardless of whether they have published
// listings yet. Query params are best-effort: anything malformed is
// silently ignored rather than rejected with a 400. The query lives in
// lib/server/public/agents.ts, shared with the server-rendered page.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { searchPublicAgents } from '@/lib/server/public/agents';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const result = await searchPublicAgents(req.nextUrl.searchParams);
    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
