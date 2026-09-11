// ADMIN-BLOG-ARTICLES-02 — GET + PATCH + DELETE /api/admin/blog/articles/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeReq(
  method: 'GET' | 'PATCH' | 'DELETE',
  id: string,
  body?: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/blog/articles/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const existingArticle = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  contentHtml: '<p>Contenu</p>',
  coverImageUrl: null,
  tags: ['Cocody'],
  authorName: 'Jean',
  authorRole: null,
  authorAvatarUrl: null,
  status: 'DRAFT',
  isFeatured: false,
  viewCount: 0,
  readTimeMinutes: 1,
  publishedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  categoryId: 'cat_1',
  category: { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogArticle.findUnique.mockResolvedValue(existingArticle as never);
  prismaMock.blogArticle.update.mockResolvedValue({
    ...existingArticle,
    title: 'Titre modifié',
  } as never);
  prismaMock.blogArticle.delete.mockResolvedValue({ id: 'art_1' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('GET', 'missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns the full article including contentHtml', async () => {
    const { req, ctx } = makeReq('GET', 'art_1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { contentHtml: string } };
    expect(body.article.contentHtml).toBe('<p>Contenu</p>');
  });
});

describe('PATCH /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'missing', { title: 'X' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('400s when categoryId does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'art_1', { categoryId: 'ghost' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('sanitizes contentHtml and recomputes readTimeMinutes when contentHtml is updated', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', {
      contentHtml: '<p>Nouveau</p><script>alert(1)</script>',
    });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as {
      data: { contentHtml?: string; readTimeMinutes?: number };
    };
    expect(call.data.contentHtml).not.toContain('<script>');
    expect(call.data.readTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  it('sets publishedAt only the first time status becomes PUBLISHED', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', { status: 'PUBLISHED' });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as {
      data: { publishedAt?: Date };
    };
    expect(call.data.publishedAt).toBeInstanceOf(Date);
  });

  it('does not touch publishedAt when the article is already published', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce({
      ...existingArticle,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    } as never);
    const { req, ctx } = makeReq('PATCH', 'art_1', { title: 'Titre modifié' });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as {
      data: { publishedAt?: Date };
    };
    expect(call.data.publishedAt).toBeUndefined();
  });

  it('logs an admin action on update', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', { title: 'Titre modifié' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.update' }) }),
    );
  });
});

describe('DELETE /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('DELETE', 'missing');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('deletes the article and logs an admin action', async () => {
    const { req, ctx } = makeReq('DELETE', 'art_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogArticle.delete).toHaveBeenCalledWith({ where: { id: 'art_1' } });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.delete' }) }),
    );
  });
});
