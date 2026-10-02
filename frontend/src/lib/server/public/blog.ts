// Public blog article — single source for GET /api/public/blog/articles/[slug]
// and the server-rendered /blog/[slug] page. Only PUBLISHED articles are
// returned (null otherwise). The view counter stays in the API route so
// crawler renders do not count as reads.
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
