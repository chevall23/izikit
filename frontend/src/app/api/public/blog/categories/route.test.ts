// PUBLIC-BLOG-CATEGORIES-01 — GET /api/public/blog/categories tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/blog/categories');
}

beforeEach(() => {
  prismaMock.blogCategory.findMany.mockResolvedValue([
    { slug: 'marche', label: 'Marché', colorKey: 'brand', _count: { articles: 5 } },
    { slug: 'conseils', label: 'Conseils acheteurs', colorKey: 'green', _count: { articles: 2 } },
  ] as never);
});

describe('GET /api/public/blog/categories', () => {
  it('returns categories with published-article counts only', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: { slug: string; count: number }[] };
    expect(body.categories).toEqual([
      { slug: 'marche', label: 'Marché', colorKey: 'brand', count: 5 },
      { slug: 'conseils', label: 'Conseils acheteurs', colorKey: 'green', count: 2 },
    ]);
    expect(prismaMock.blogCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
        }),
      }),
    );
  });
});
