// Public blog — single source for the /api/public/blog/* routes and the
// server-rendered /blog and /blog/[slug] pages. Only PUBLISHED articles are
// ever returned. The view counter stays in the API route so crawler renders
// do not count as reads.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';

const ARTICLE_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  coverImageUrl: true,
  tags: true,
  authorName: true,
  authorRole: true,
  authorAvatarUrl: true,
  status: true,
  readTimeMinutes: true,
  publishedAt: true,
  updatedAt: true,
  viewCount: true,
  category: { select: { slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export interface PublicArticleDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  tags: string[];
  author: { name: string; role: string | null; avatarUrl: string | null };
  category: { slug: string; label: string; colorKey: string };
  readTimeMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
  viewCount: number;
}

export async function getPublishedArticle(slug: string): Promise<PublicArticleDetail | null> {
  const article = await prisma.blogArticle.findUnique({
    where: { slug },
    select: ARTICLE_DETAIL_SELECT,
  });
  if (!article || article.status !== 'PUBLISHED') return null;
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    contentHtml: article.contentHtml,
    coverImageUrl: article.coverImageUrl,
    tags: (article.tags as string[]) ?? [],
    author: {
      name: article.authorName,
      role: article.authorRole,
      avatarUrl: article.authorAvatarUrl,
    },
    category: article.category,
    readTimeMinutes: article.readTimeMinutes,
    publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString() : null,
    updatedAt: new Date(article.updatedAt ?? article.publishedAt ?? Date.now()).toISOString(),
    viewCount: article.viewCount,
  };
}

// ── Article list (/blog index, GET /api/public/blog/articles) ─────────────
//
// Query params are best-effort — malformed input is silently ignored, never
// a 400, since this backs a public browse page. `sort=popular` also serves
// the "Articles populaires" sidebar. `featured` is the isFeatured=true
// article most recently published, falling back to the most recent one; it
// is never filtered by `category`/`q` (fixed editorial hero slot).

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
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    viewCount: r.viewCount,
  };
}

export type PublicArticleItem = ReturnType<typeof mapArticle>;
export type PublicArticlesResult = Awaited<ReturnType<typeof searchPublicArticles>>;

export async function searchPublicArticles(params: URLSearchParams) {
  const categorySlug = params.get('category')?.trim() || undefined;
  const q = (params.get('q') ?? '').slice(0, Q_MAX).trim() || undefined;
  const page = parsePage(params.get('page'));
  const limit = parseLimit(params.get('limit'));
  const sort = params.get('sort') === 'popular' ? 'popular' : 'recent';

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

  return {
    items: rows.map(mapArticle),
    featured: featuredRow ? mapArticle(featuredRow) : null,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ── Categories — `count` only counts PUBLISHED articles, so the tab badges
// never leak unpublished-content counts. ─────────────────────────────────

export async function listBlogCategories() {
  const rows = await prisma.blogCategory.findMany({
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
    select: {
      slug: true,
      label: true,
      colorKey: true,
      _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
    },
  });
  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    colorKey: r.colorKey,
    count: r._count.articles,
  }));
}

// ── Tags — aggregated in memory from the `tags` Json column of every
// PUBLISHED article (small volume; a BlogTag table would be premature). ──

const TOP_TAGS = 12;

export async function listBlogTags() {
  const rows = await prisma.blogArticle.findMany({
    where: { status: 'PUBLISHED' },
    select: { tags: true },
  });

  const freq = new Map<string, number>();
  for (const row of rows) {
    for (const raw of (row.tags as string[]) ?? []) {
      const tag = raw.trim();
      if (!tag) continue;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAGS)
    .map(([tag, count]) => ({ tag, count }));
}
