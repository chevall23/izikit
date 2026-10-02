// GET /ancien-agent/<iddem> — 301 from the legacy agent URL
// (demarcheur-detail.php?demarcheur=<id>, rewritten here by Apache) to the
// agent's profile, or to the directory when the agent is unknown.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { legacyAgentTarget } from '@/lib/server/public/legacy-redirect';
import { absoluteUrl } from '@/lib/seo/site';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const target = await legacyAgentTarget(id).catch(() => '/agents');
  return NextResponse.redirect(absoluteUrl(target), 301);
}
