// PUBLIC-BLOG-CATEGORIES-01 — GET /api/public/blog/categories
//
// Unauthenticated. `count` is the number of PUBLISHED articles in the
// category (never counts DRAFT/ARCHIVED) — the public /blog page's tab
// badges must never leak unpublished-content counts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { listBlogCategories } from '@/lib/server/public/blog';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const categories = await listBlogCategories();
    return NextResponse.json({ categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
