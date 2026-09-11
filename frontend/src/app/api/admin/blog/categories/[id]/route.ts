// ADMIN-BLOG-CATEGORIES-02 — PATCH + DELETE /api/admin/blog/categories/[id]
//
// PATCH edits label/colorKey/position only — slug is immutable once
// created (it's the stable public URL segment via BlogArticle.category,
// same rationale as Organization.slug).
// DELETE is refused (409) while any BlogArticle still references the
// category — checked explicitly with a count() rather than relying on
// the Prisma `Restrict` FK error, so the response body stays a clean,
// documented error code instead of a raw P2003.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const COLOR_KEYS = ['brand', 'green', 'amber', 'violet', 'red'] as const;

const UpdateBody = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  colorKey: z.enum(COLOR_KEYS).optional(),
  position: z.number().int().min(0).optional(),
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

    const existing = await prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const data = parsed.data;
    const updated = await prisma.blogCategory.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.colorKey !== undefined && { colorKey: data.colorKey }),
        ...(data.position !== undefined && { position: data.position }),
      },
      select: { id: true, slug: true, label: true, colorKey: true, position: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.update',
      targetType: 'BlogCategory',
      targetId: id,
      metadata: data,
    });

    return NextResponse.json(
      { category: updated },
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
    const existing = await prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const articleCount = await prisma.blogArticle.count({ where: { categoryId: id } });
    if (articleCount > 0) {
      return NextResponse.json(
        { error: 'CATEGORY_IN_USE', message: 'Category still has articles attached' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.blogCategory.delete({ where: { id } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.delete',
      targetType: 'BlogCategory',
      targetId: id,
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
