// PUBLIC-BLOG-ARTICLES-01 — GET /api/public/blog/articles
//
// Unauthenticated, read-only. Only PUBLISHED articles are ever returned.
// Query params are best-effort (mirrors GET /api/public/listings) —
// malformed input is silently ignored, never a 400, since this backs a
// public browse page.
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
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_LIMIT = 7;
const MAX_LIMIT = 24;
const Q_MAX = 200;

function parsePage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

const ARTICLE_PUBLIC_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  tags: true,
  authorName: true,
  authorRole: true,
  authorAvatarUrl: true,
  readTimeMinutes: true,
  publishedAt: true,
  viewCount: true,
  category: { select: { slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

type ArticleRow = Prisma.BlogArticleGetPayload<{ select: typeof ARTICLE_PUBLIC_SELECT }>;

function mapArticle(r: ArticleRow) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImageUrl: r.coverImageUrl,
    tags: (r.tags as string[]) ?? [],
    author: { name: r.authorName, role: r.authorRole, avatarUrl: r.authorAvatarUrl },
    category: r.category,
    readTimeMinutes: r.readTimeMinutes,
    publishedAt: r.publishedAt,
    viewCount: r.viewCount,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const sp = req.nextUrl.searchParams;
    const categorySlug = sp.get('category')?.trim() || undefined;
    const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim() || undefined;
    const page = parsePage(sp.get('page'));
    const limit = parseLimit(sp.get('limit'));
    const sort = sp.get('sort') === 'popular' ? 'popular' : 'recent';

    const where: Prisma.BlogArticleWhereInput = {
      status: 'PUBLISHED',
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.BlogArticleOrderByWithRelationInput[] =
      sort === 'popular'
        ? [{ viewCount: 'desc' }, { id: 'desc' }]
        : [{ publishedAt: 'desc' }, { id: 'desc' }];

    const [rows, total, featuredRow] = await Promise.all([
      prisma.blogArticle.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: ARTICLE_PUBLIC_SELECT,
      }),
      prisma.blogArticle.count({ where }),
      prisma.blogArticle.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        select: ARTICLE_PUBLIC_SELECT,
      }),
    ]);

    return NextResponse.json(
      {
        items: rows.map(mapArticle),
        featured: featuredRow ? mapArticle(featuredRow) : null,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
