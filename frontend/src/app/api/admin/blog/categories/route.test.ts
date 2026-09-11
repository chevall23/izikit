// ADMIN-BLOG-CATEGORIES-01 — GET + POST /api/admin/blog/categories tests.
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

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/blog/categories');
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/blog/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogCategory.findMany.mockResolvedValue([
    {
      id: 'cat_1',
      slug: 'marche',
      label: 'Marché',
      colorKey: 'brand',
      position: 0,
      _count: { articles: 3 },
    },
  ] as never);
  prismaMock.blogCategory.create.mockResolvedValue({
    id: 'cat_2',
    slug: 'conseils',
    label: 'Conseils',
    colorKey: 'green',
    position: 1,
  } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/categories', () => {
  it('returns categories with articleCount derived from _count', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: { slug: string; articleCount: number }[] };
    expect(body.categories).toEqual([
      {
        id: 'cat_1',
        slug: 'marche',
        label: 'Marché',
        colorKey: 'brand',
        position: 0,
        articleCount: 3,
      },
    ]);
  });

  it('propagates a non-admin response without querying the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.blogCategory.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/blog/categories', () => {
  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ label: '' }));
    expect(res.status).toBe(400);
  });

  it('creates a category with an auto-generated slug and logs an admin action', async () => {
    const res = await POST(makePost({ label: 'Conseils', colorKey: 'green', position: 1 }));
    expect(res.status).toBe(201);
    expect(prismaMock.blogCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'conseils',
          label: 'Conseils',
          colorKey: 'green',
          position: 1,
        }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'blog_category.create', targetId: 'cat_2' }),
      }),
    );
  });

  it('defaults colorKey to brand and position to 0 when omitted', async () => {
    await POST(makePost({ label: 'Juridique' }));
    expect(prismaMock.blogCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ colorKey: 'brand', position: 0 }),
      }),
    );
  });
});
