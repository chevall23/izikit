// PUBLIC-BLOG-ARTICLES-01 — GET /api/public/blog/articles
//
// Unauthenticated, read-only. Only PUBLISHED articles are ever returned.
// Query params are best-effort (mirrors GET /api/public/listings) —
// malformed input is silently ignored, never a 400, since this backs a
// public browse page. The query lives in lib/server/public/blog.ts, shared
// with the server-rendered /blog page.
//
// `sort=popular` also serves the "Articles populaires" sidebar
// (?sort=popular&limit=5) — same endpoint, no separate route needed.
//
// `featured` is the isFeatured=true PUBLISHED article most recently
// published, falling back to the most recently published article overall
// when none is flagged. It is never filtered by `category`/`q` — it's the
// fixed editorial hero slot, independent of the list's current filter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { searchPublicArticles } from '@/lib/server/public/blog';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const result = await searchPublicArticles(req.nextUrl.searchParams);
    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
