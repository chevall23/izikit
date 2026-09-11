// ADMIN-BLOG-CATEGORIES-02 — PATCH + DELETE /api/admin/blog/categories/[id] tests.
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
import { PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeReq(
  method: 'PATCH' | 'DELETE',
  id: string,
  body?: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/blog/categories/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogCategory.findUnique.mockResolvedValue({
    id: 'cat_1',
    slug: 'marche',
    label: 'Marché',
    colorKey: 'brand',
    position: 0,
  } as never);
  prismaMock.blogCategory.update.mockResolvedValue({
    id: 'cat_1',
    slug: 'marche',
    label: 'Marché immobilier',
    colorKey: 'brand',
    position: 0,
  } as never);
  prismaMock.blogArticle.count.mockResolvedValue(0 as never);
  prismaMock.blogCategory.delete.mockResolvedValue({ id: 'cat_1' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('PATCH /api/admin/blog/categories/[id]', () => {
  it('404s when the category does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'missing', { label: 'X' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('updates the label and logs an admin action', async () => {
    const { req, ctx } = makeReq('PATCH', 'cat_1', { label: 'Marché immobilier' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat_1' }, data: { label: 'Marché immobilier' } }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'blog_category.update' }),
      }),
    );
  });
});

describe('DELETE /api/admin/blog/categories/[id]', () => {
  it('404s when the category does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('DELETE', 'missing');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('409s when the category still has articles', async () => {
    prismaMock.blogArticle.count.mockResolvedValueOnce(2 as never);
    const { req, ctx } = makeReq('DELETE', 'cat_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(409);
    expect(prismaMock.blogCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused category and logs an admin action', async () => {
    const { req, ctx } = makeReq('DELETE', 'cat_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'blog_category.delete' }),
      }),
    );
  });
});
