// PUBLIC-BLOG-ARTICLE-DETAIL-01 — GET /api/public/blog/articles/[slug]
//
// Unauthenticated. Only a PUBLISHED article is ever returned — 404 for
// DRAFT/ARCHIVED/missing, so this route never leaks unpublished content.
// Increments viewCount best-effort (mirrors GET /api/public/listings/[id]) —
// a lost increment under a race is an acceptable trade-off for a vanity
// counter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { getPublishedArticle } from '@/lib/server/public/blog';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { slug } = await ctx.params;

    const article = await getPublishedArticle(slug);
    if (!article) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let viewCount = article.viewCount;
    try {
      const updated = await prisma.blogArticle.update({
        where: { slug },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });
      viewCount = updated.viewCount;
    } catch (err) {
      log.warn('blog-article-detail: viewCount increment failed', {
        slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(
      { ...article, viewCount },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
