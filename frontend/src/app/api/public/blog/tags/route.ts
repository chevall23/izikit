// PUBLIC-BLOG-TAGS-01 — GET /api/public/blog/tags
//
// Unauthenticated. Aggregates `tags` (a Json string[] column) across every
// PUBLISHED article in memory — expected article volume is small enough
// that a dedicated BlogTag table would be premature (YAGNI).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const TOP_N = 12;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rows = await prisma.blogArticle.findMany({
      where: { status: 'PUBLISHED' },
      select: { tags: true },
    });

    const freq = new Map<string, number>();
    for (const row of rows) {
      for (const raw of (row.tags as string[]) ?? []) {
        const tag = raw.trim();
        if (!tag) continue;
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }

    const tags = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([tag, count]) => ({ tag, count }));

    return NextResponse.json({ tags }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
