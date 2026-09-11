// ADMIN-BLOG-ARTICLES-01 — GET + POST /api/admin/blog/articles
//
// GET: cursor-paginated list for the (future) admin UI, filters
// status/categoryId/q. Mirrors GET /api/admin/property-requests.
// POST: creates an article. slug is auto-derived from title (never
// client-supplied). contentHtml is sanitized and readTimeMinutes is
// computed server-side on every write — the admin never sets either
// directly. publishedAt is set only when status is created as PUBLISHED.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { sanitizeArticleHtml } from '@/lib/server/blog/sanitize';
import { computeReadTimeMinutes } from '@/lib/server/blog/read-time';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const Q_MAX = 200;

const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  status: true,
  isFeatured: true,
  viewCount: true,
  readTimeMinutes: true,
  publishedAt: true,
  createdAt: true,
  authorName: true,
  category: { select: { id: true, slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));
    const status = sp.get('status');
    const categoryId = sp.get('categoryId');
    const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();

    const filterWhere: Prisma.BlogArticleWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const where: Prisma.BlogArticleWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, total] = await Promise.all([
      prisma.blogArticle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: ARTICLE_LIST_SELECT,
      }),
      prisma.blogArticle.count({ where: filterWhere }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    return NextResponse.json(
      { items: page.items, nextCursor: page.nextCursor, total },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(400),
  contentHtml: z.string().trim().min(1).max(50_000),
  categoryId: z.string().trim().min(1),
  coverImageUrl: z.string().trim().url().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  authorName: z.string().trim().min(1).max(120),
  authorRole: z.string().trim().max(120).optional(),
  authorAvatarUrl: z.string().trim().url().max(500).optional(),
  status: z.enum(STATUSES).default('DRAFT'),
  isFeatured: z.boolean().default(false),
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

    const category = await prisma.blogCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const contentHtml = sanitizeArticleHtml(data.contentHtml);
    const readTimeMinutes = computeReadTimeMinutes(contentHtml);
    const publishedAt = data.status === 'PUBLISHED' ? new Date() : null;

    let created!: Prisma.BlogArticleGetPayload<{ select: typeof ARTICLE_LIST_SELECT }>;
    const base = slugify(data.title) || 'article';
    await ensureUniqueSlug(base, async (candidate) => {
      created = await prisma.blogArticle.create({
        data: {
          slug: candidate,
          title: data.title,
          excerpt: data.excerpt,
          contentHtml,
          categoryId: data.categoryId,
          tags: data.tags,
          authorName: data.authorName,
          ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
          ...(data.authorRole !== undefined && { authorRole: data.authorRole }),
          ...(data.authorAvatarUrl !== undefined && { authorAvatarUrl: data.authorAvatarUrl }),
          status: data.status,
          isFeatured: data.isFeatured,
          readTimeMinutes,
          publishedAt,
        },
        select: ARTICLE_LIST_SELECT,
      });
      return created;
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.create',
      targetType: 'BlogArticle',
      targetId: created.id,
      metadata: { title: created.title, status: created.status },
    });

    return NextResponse.json(
      { article: created },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
