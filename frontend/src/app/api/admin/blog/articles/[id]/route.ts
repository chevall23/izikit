// ADMIN-BLOG-ARTICLES-02 — GET + PATCH + DELETE /api/admin/blog/articles/[id]
//
// GET: full detail (contentHtml included) for admin re-editing.
// PATCH: partial update. slug is never editable (stable public URL).
// contentHtml, when provided, is re-sanitized and readTimeMinutes is
// recomputed. publishedAt is set ONLY the first time status becomes
// PUBLISHED (existing.publishedAt is still null) — later edits never
// reset the original publish date, even if status flips away and back.
// DELETE: hard delete, audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { sanitizeArticleHtml } from '@/lib/server/blog/sanitize';
import { computeReadTimeMinutes } from '@/lib/server/blog/read-time';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

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
  isFeatured: true,
  viewCount: true,
  readTimeMinutes: true,
  publishedAt: true,
  createdAt: true,
  categoryId: true,
  category: { select: { id: true, slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const article = await prisma.blogArticle.findUnique({
      where: { id },
      select: ARTICLE_DETAIL_SELECT,
    });
    if (!article) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { article: { ...article, tags: (article.tags as string[]) ?? [] } },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  excerpt: z.string().trim().min(1).max(400).optional(),
  contentHtml: z.string().trim().min(1).max(50_000).optional(),
  categoryId: z.string().trim().min(1).optional(),
  coverImageUrl: z.string().trim().url().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  authorName: z.string().trim().min(1).max(120).optional(),
  authorRole: z.string().trim().max(120).nullable().optional(),
  authorAvatarUrl: z.string().trim().url().max(500).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  isFeatured: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = UpdateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.blogArticle.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const data = parsed.data;

    if (data.categoryId !== undefined) {
      const category = await prisma.blogCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const contentHtml =
      data.contentHtml !== undefined ? sanitizeArticleHtml(data.contentHtml) : undefined;
    const readTimeMinutes =
      contentHtml !== undefined ? computeReadTimeMinutes(contentHtml) : undefined;
    const publishedAt =
      data.status === 'PUBLISHED' && existing.publishedAt === null ? new Date() : undefined;

    const updated = await prisma.blogArticle.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
        ...(contentHtml !== undefined && { contentHtml }),
        ...(readTimeMinutes !== undefined && { readTimeMinutes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.authorName !== undefined && { authorName: data.authorName }),
        ...(data.authorRole !== undefined && { authorRole: data.authorRole }),
        ...(data.authorAvatarUrl !== undefined && { authorAvatarUrl: data.authorAvatarUrl }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.isFeatured !== undefined && { isFeatured: data.isFeatured }),
        ...(publishedAt !== undefined && { publishedAt }),
      },
      select: ARTICLE_DETAIL_SELECT,
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.update',
      targetType: 'BlogArticle',
      targetId: id,
      metadata: { from: existing.status, to: data.status ?? existing.status },
    });

    return NextResponse.json(
      { article: { ...updated, tags: (updated.tags as string[]) ?? [] } },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.blogArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.blogArticle.delete({ where: { id } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.delete',
      targetType: 'BlogArticle',
      targetId: id,
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
