// PUBLIC-BLOG-TAGS-01 — GET /api/public/blog/tags tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/blog/tags');
}

beforeEach(() => {
  prismaMock.blogArticle.findMany.mockResolvedValue([
    { tags: ['Cocody', 'Marché'] },
    { tags: ['Cocody', 'Dakar'] },
    { tags: ['Cocody'] },
    { tags: [] },
  ] as never);
});

describe('GET /api/public/blog/tags', () => {
  it('only reads tags from PUBLISHED articles', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('aggregates tag frequency across articles, sorted descending', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tags: { tag: string; count: number }[] };
    expect(body.tags[0]).toEqual({ tag: 'Cocody', count: 3 });
    expect(body.tags.map((t) => t.tag)).toContain('Marché');
    expect(body.tags.map((t) => t.tag)).toContain('Dakar');
  });

  it('caps the result at 12 tags', async () => {
    prismaMock.blogArticle.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({ tags: [`tag-${i}`] })) as never,
    );
    const res = await GET(makeGet());
    const body = (await res.json()) as { tags: unknown[] };
    expect(body.tags).toHaveLength(12);
  });
});
