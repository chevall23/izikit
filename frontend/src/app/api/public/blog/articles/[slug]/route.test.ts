// PUBLIC-BLOG-ARTICLE-DETAIL-01 — GET /api/public/blog/articles/[slug] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(slug: string): { req: NextRequest; ctx: { params: Promise<{ slug: string }> } } {
  return {
    req: new NextRequest(`http://test/api/public/blog/articles/${slug}`),
    ctx: { params: Promise.resolve({ slug }) },
  };
}

const publishedArticle = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  contentHtml: '<p>Contenu</p>',
  coverImageUrl: null,
  tags: ['Cocody'],
  authorName: 'Jean',
  authorRole: 'Expert',
  authorAvatarUrl: null,
  readTimeMinutes: 5,
  publishedAt: new Date('2026-09-01T00:00:00Z'),
  viewCount: 10,
  status: 'PUBLISHED',
  category: { slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  prismaMock.blogArticle.findUnique.mockResolvedValue(publishedArticle as never);
  prismaMock.blogArticle.update.mockResolvedValue({ viewCount: 11 } as never);
});

describe('GET /api/public/blog/articles/[slug]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the article is DRAFT', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce({
      ...publishedArticle,
      status: 'DRAFT',
    } as never);
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns the article with contentHtml and incremented viewCount', async () => {
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contentHtml: string; viewCount: number };
    expect(body.contentHtml).toBe('<p>Contenu</p>');
    expect(body.viewCount).toBe(11);
    expect(prismaMock.blogArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'mon-article' },
        data: { viewCount: { increment: 1 } },
      }),
    );
  });

  it('still returns 200 when the viewCount increment throws', async () => {
    prismaMock.blogArticle.update.mockRejectedValueOnce(new Error('db down'));
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });
});
