// GET /api/listings/[id]/documents/[docId]/file — opens a listing document
// (title deed, …). Listing owner or admin; 404 for anyone else. Private
// documents are streamed from the private bucket (never cached); rows
// uploaded before it existed redirect to their legacy public URL.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { canOpenDocument } from '@/lib/server/upload/document-access';
import { serveStoredDocument } from '@/lib/server/upload/sensitive-documents';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id, docId } = await ctx.params;
    const doc = await prisma.listingDocument.findUnique({
      where: { id: docId },
      select: { listingId: true, url: true, filename: true, listing: { select: { userId: true } } },
    });
    if (
      !doc ||
      doc.listingId !== id ||
      !(await canOpenDocument(auth.user.sub, doc.listing.userId))
    ) {
      return NextResponse.json(
        { error: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return serveStoredDocument(doc);
  });
}
