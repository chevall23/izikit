// PUBLIC-BLOG-ARTICLES-01 — GET /api/public/blog/articles tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'art_1',
    slug: 'article-un',
    title: 'Article un',
    excerpt: 'Extrait',
    coverImageUrl: null,
    tags: ['Cocody'],
    authorName: 'Jean',
    authorRole: 'Expert',
    authorAvatarUrl: null,
    readTimeMinutes: 5,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    viewCount: 10,
    category: { slug: 'marche', label: 'Marché', colorKey: 'brand' },
    ...overrides,
  };
}

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/public/blog/articles${qs}`);
}

beforeEach(() => {
  prismaMock.blogArticle.findMany.mockResolvedValue([makeRow()] as never);
  prismaMock.blogArticle.count.mockResolvedValue(1 as never);
  prismaMock.blogArticle.findFirst.mockResolvedValue(makeRow({ id: 'art_featured' }) as never);
});

describe('GET /api/public/blog/articles', () => {
  it('only queries status PUBLISHED', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('filters by category slug and search query', async () => {
    await GET(makeGet('?category=marche&q=cocody'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          category: { slug: 'marche' },
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('orders by viewCount desc when sort=popular', async () => {
    await GET(makeGet('?sort=popular'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ viewCount: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('orders by publishedAt desc by default', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('returns items, featured, and pagination metadata', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { slug: string }[];
      featured: { id: string } | null;
      total: number;
      totalPages: number;
    };
    expect(body.items).toHaveLength(1);
    expect(body.featured?.id).toBe('art_featured');
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it('never 400s on malformed query params', async () => {
    const res = await GET(makeGet('?page=not-a-number&limit=-5'));
    expect(res.status).toBe(200);
  });

  it('returns featured: null when no published article exists', async () => {
    prismaMock.blogArticle.findFirst.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet());
    const body = (await res.json()) as { featured: null };
    expect(body.featured).toBeNull();
  });
});
