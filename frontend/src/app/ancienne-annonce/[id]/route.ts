// GET /ancienne-annonce/<idannonce> — 301 from the legacy listing URL
// (detail-annonce.php?annonce=<id>, rewritten here by Apache) to the
// listing's current page, or to /annonces when it no longer exists.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { legacyListingTarget } from '@/lib/server/public/legacy-redirect';
import { absoluteUrl } from '@/lib/seo/site';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const target = await legacyListingTarget(id).catch(() => '/annonces');
  return NextResponse.redirect(absoluteUrl(target), 301);
}
