// PUBLIC-BLOG-CATEGORIES-01 — GET /api/public/blog/categories
//
// Unauthenticated. `count` is the number of PUBLISHED articles in the
// category (never counts DRAFT/ARCHIVED) — the public /blog page's tab
// badges must never leak unpublished-content counts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rows = await prisma.blogCategory.findMany({
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
      select: {
        slug: true,
        label: true,
        colorKey: true,
        _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
      },
    });

    const categories = rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      colorKey: r.colorKey,
      count: r._count.articles,
    }));

    return NextResponse.json({ categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
