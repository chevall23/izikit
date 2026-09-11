// ADMIN-BLOG-ARTICLES-01 — GET + POST /api/admin/blog/articles tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
import { GET, POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/blog/articles${qs}`);
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/blog/articles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const row = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  coverImageUrl: null,
  status: 'DRAFT',
  isFeatured: false,
  viewCount: 0,
  readTimeMinutes: 1,
  publishedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  authorName: 'Jean',
  category: { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogArticle.findMany.mockResolvedValue([row] as never);
  prismaMock.blogArticle.count.mockResolvedValue(1 as never);
  prismaMock.blogCategory.findUnique.mockResolvedValue({ id: 'cat_1' } as never);
  prismaMock.blogArticle.create.mockResolvedValue(row as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/articles', () => {
  it('returns items, nextCursor and total', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
      total: number;
    };
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('filters by status and categoryId', async () => {
    await GET(makeGet('?status=PUBLISHED&categoryId=cat_1'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED', categoryId: 'cat_1' }),
      }),
    );
  });
});

const validCreate = {
  title: 'Nouvel article',
  excerpt: 'Un extrait suffisamment long',
  contentHtml: '<p>Contenu de test avec plusieurs mots pour le calcul du temps de lecture.</p>',
  categoryId: 'cat_1',
  authorName: 'Jean',
};

describe('POST /api/admin/blog/articles', () => {
  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ title: '' }));
    expect(res.status).toBe(400);
  });

  it('400s when categoryId does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CATEGORY_NOT_FOUND');
  });

  it('creates an article, sanitizes contentHtml, computes readTimeMinutes, and logs an admin action', async () => {
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(201);
    expect(prismaMock.blogArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Nouvel article',
          categoryId: 'cat_1',
          status: 'DRAFT',
          publishedAt: null,
        }),
      }),
    );
    const call = prismaMock.blogArticle.create.mock.calls[0]?.[0] as {
      data: { contentHtml: string; readTimeMinutes: number };
    };
    expect(call.data.contentHtml).not.toContain('<script>');
    expect(call.data.readTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.create' }) }),
    );
  });

  it('sets publishedAt when status is PUBLISHED', async () => {
    await POST(makePost({ ...validCreate, status: 'PUBLISHED' }));
    const call = prismaMock.blogArticle.create.mock.calls[0]?.[0] as {
      data: { publishedAt: Date | null };
    };
    expect(call.data.publishedAt).toBeInstanceOf(Date);
  });

  it('propagates a non-admin response without querying the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(403);
    expect(prismaMock.blogArticle.create).not.toHaveBeenCalled();
  });
});
