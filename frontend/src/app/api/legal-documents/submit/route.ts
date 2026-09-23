/**
 * POST /api/legal-documents/submit — /settings "Documents légaux" tab,
 * batch flow.
 *
 * Unlike POST /api/legal-documents (single-file, immediate upload per row),
 * this route accepts all still-editable document types in ONE multipart
 * request (one file field per type, keyed by the type name itself, e.g.
 * `form.append('RCCM', file)`) and charges 1 token per file on success.
 *
 * A VERIFIED document is locked — its type is excluded from the required
 * set, and attempting to resubmit it returns 409 DOCUMENT_VERIFIED (mirrors
 * the single-file route).
 *
 * Order of operations:
 *   1. Validate presence of every editable type + size/MIME per file.
 *   2. Check tokenWallet.balance >= file count BEFORE any network call —
 *      insufficient balance aborts with nothing uploaded and nothing
 *      charged (422 INSUFFICIENT_TOKENS).
 *   3. Upload each file to R2 sequentially (magic-byte sniffed
 *      first). A failure here (mismatch, storage error) aborts before any
 *      DB write — no partial charge.
 *   4. One Serializable-free Prisma transaction: upsert every LegalDocument
 *      row (status reset to PENDING), decrement the wallet, write one
 *      TokenTransaction (type USAGE), and — best-effort — enqueue an
 *      outbox admin-alert email (skipped when LEGAL_DOCUMENTS_ADMIN_EMAIL
 *      is unset).
 */
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/storage-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { enqueueOutbox } from '@/lib/server/outbox';
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from '../route';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    if (
      !process.env.R2_ACCOUNT_ID ||
      !process.env.R2_ACCESS_KEY_ID ||
      !process.env.R2_SECRET_ACCESS_KEY ||
      !process.env.R2_BUCKET_NAME ||
      !process.env.R2_PUBLIC_URL
    ) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.legalDocument.findMany({
      where: { userId: auth.user.sub },
      select: { type: true, status: true },
    });
    const verifiedTypes = new Set(
      existing.filter((r) => r.status === 'VERIFIED').map((r) => r.type),
    );

    const form = await req.formData();

    for (const type of verifiedTypes) {
      if (form.get(type) instanceof File) {
        return NextResponse.json(
          { code: 'DOCUMENT_VERIFIED', message: 'A verified document cannot be replaced' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const editableTypes = LEGAL_DOCUMENT_TYPES.filter((t) => !verifiedTypes.has(t));
    if (editableTypes.length === 0) {
      return NextResponse.json(
        { code: 'NOTHING_TO_SUBMIT', message: 'All documents are already verified' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const files: { type: LegalDocumentType; file: File }[] = [];
    const missing: LegalDocumentType[] = [];
    for (const type of editableTypes) {
      const f = form.get(type);
      if (f instanceof File) {
        files.push({ type, file: f });
      } else {
        missing.push(type);
      }
    }
    if (missing.length > 0) {
      return NextResponse.json(
        { code: 'MISSING_DOCUMENTS', message: 'All documents are required', missing },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    for (const { type, file } of files) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { code: 'FILE_TOO_LARGE', message: `Max ${MAX_BYTES} bytes`, type },
          { status: 413, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json(
          { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed`, type },
          { status: 415, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const cost = files.length;
    const wallet = await prisma.tokenWallet.findUnique({
      where: { userId: auth.user.sub },
      select: { balance: true },
    });
    const balance = wallet?.balance ?? 0;
    if (balance < cost) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_TOKENS',
          message: `Solde de jetons insuffisant : ${cost} requis, ${balance} disponible(s)`,
          required: cost,
          balance,
        },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const uploaded: {
      type: LegalDocumentType;
      filename: string;
      mimeType: string;
      publicId: string;
      secureUrl: string;
      bytes: number;
    }[] = [];

    for (const { type, file } of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const { match, sniffed } = verifyMagicBytes(buf, file.type);
      if (sniffed && !match) {
        return NextResponse.json(
          { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME', type },
          { status: 415, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const publicId = `legal-documents/${auth.user.sub}/${type}-${randomUUID()}`;
      try {
        const up = await uploadBuffer(publicId, buf, file.type);
        uploaded.push({
          type,
          filename: sanitizeFilename(file.name),
          mimeType: file.type,
          publicId: up.publicId,
          secureUrl: up.secureUrl,
          bytes: up.bytes,
        });
      } catch (e) {
        if (e instanceof StorageNotConfiguredError) {
          return NextResponse.json(
            { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
            { status: 503, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        return NextResponse.json(
          { code: 'UPLOAD_FAILED', message: 'Storage write failed', type },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const documents = [];
      for (const u of uploaded) {
        const row = await tx.legalDocument.upsert({
          where: { userId_type: { userId: auth.user.sub, type: u.type } },
          create: {
            userId: auth.user.sub,
            type: u.type,
            status: 'PENDING',
            key: u.publicId,
            url: u.secureUrl,
            filename: u.filename,
            mimeType: u.mimeType,
            sizeBytes: u.bytes,
          },
          update: {
            status: 'PENDING',
            key: u.publicId,
            url: u.secureUrl,
            filename: u.filename,
            mimeType: u.mimeType,
            sizeBytes: u.bytes,
            rejectionReason: null,
          },
          select: {
            type: true,
            status: true,
            url: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            expiresAt: true,
            rejectionReason: true,
            createdAt: true,
          },
        });
        documents.push(row);
      }

      const newWallet = await tx.tokenWallet.update({
        where: { userId: auth.user.sub },
        data: { balance: { decrement: cost } },
      });
      await tx.tokenTransaction.create({
        data: {
          userId: auth.user.sub,
          type: 'USAGE',
          amount: -cost,
          balanceAfter: newWallet.balance,
          description: `Vérification documents légaux (${cost} document${cost > 1 ? 's' : ''})`,
        },
      });

      const adminEmail = process.env.LEGAL_DOCUMENTS_ADMIN_EMAIL;
      if (adminEmail) {
        await enqueueOutbox(tx, {
          kind: 'email.legal_documents_submitted',
          payload: {
            to: adminEmail,
            userEmail: auth.user.email,
            types: uploaded.map((u) => u.type),
          },
        });
      }

      return { documents, balance: newWallet.balance };
    });

    return NextResponse.json(
      { documents: result.documents, balance: result.balance },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
