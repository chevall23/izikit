// PUBLIC-BLOG-TAGS-01 — GET /api/public/blog/tags
//
// Unauthenticated. Aggregates `tags` (a Json string[] column) across every
// PUBLISHED article in memory — expected article volume is small enough
// that a dedicated BlogTag table would be premature (YAGNI).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { listBlogTags } from '@/lib/server/public/blog';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const tags = await listBlogTags();
    return NextResponse.json({ tags }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
