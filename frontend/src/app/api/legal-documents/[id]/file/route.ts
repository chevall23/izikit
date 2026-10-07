// GET /api/legal-documents/[id]/file — the only way to open a legal / KYC
// document. Owner or admin; 404 for anyone else (no existence leak). Private
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
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await prisma.legalDocument.findUnique({
      where: { id },
      select: { userId: true, url: true, filename: true },
    });
    if (!doc || !(await canOpenDocument(auth.user.sub, doc.userId))) {
      return NextResponse.json(
        { error: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return serveStoredDocument(doc);
  });
}
