// ADMIN-BLOG-CATEGORIES-01 — GET + POST /api/admin/blog/categories
//
// GET: full category list (no pagination — expected to stay small,
// admin-curated) with a live articleCount via Prisma `_count`.
// POST: creates a category. `slug` is always derived from `label` via
// slugify/ensureUniqueSlug — never accepted from the client, so category
// URLs stay stable and collision-free.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const COLOR_KEYS = ['brand', 'green', 'amber', 'violet', 'red'] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const rows = await prisma.blogCategory.findMany({
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        slug: true,
        label: true,
        colorKey: true,
        position: true,
        _count: { select: { articles: true } },
      },
    });

    const categories = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      colorKey: r.colorKey,
      position: r.position,
      articleCount: r._count.articles,
    }));

    return NextResponse.json({ categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const CreateBody = z.object({
  label: z.string().trim().min(1).max(120),
  colorKey: z.enum(COLOR_KEYS).default('brand'),
  position: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    let created!: { id: string; slug: string; label: string; colorKey: string; position: number };
    const base = slugify(data.label) || 'categorie';
    await ensureUniqueSlug(base, async (candidate) => {
      created = await prisma.blogCategory.create({
        data: {
          slug: candidate,
          label: data.label,
          colorKey: data.colorKey,
          position: data.position,
        },
        select: { id: true, slug: true, label: true, colorKey: true, position: true },
      });
      return created;
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.create',
      targetType: 'BlogCategory',
      targetId: created.id,
      metadata: { label: created.label },
    });

    return NextResponse.json(
      { category: { ...created, articleCount: 0 } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
