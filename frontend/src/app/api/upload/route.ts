/**
 * POST /api/upload — authenticated multipart file upload.
 *
 * Pipeline (D-UP-04 ordering — gates BEFORE byte read):
 *   1. CSRF (verifyCsrf) → bail 403 on mismatch
 *   2. Auth (requireAuth) → bail 401 on missing/invalid session
 *   3. R2 lazy-init → 503 STORAGE_NOT_CONFIGURED on missing creds
 *   4. formData parse → 400 UPLOAD_MISSING_FILE if no `file` field
 *   5. Size cap (UPLOAD_MAX_BYTES) → 413 FILE_TOO_LARGE
 *   6. MIME allowlist (UPLOAD_ALLOWED_MIME) → 415 INVALID_MIME
 *   7. Magic-byte sniff (verifyMagicBytes) → 415 MAGIC_BYTE_MISMATCH if sniffed && !match
 *   8. R2 PutObject (with WebP re-encode for images, see storage-client.ts) → 502 UPLOAD_FAILED on throw
 *   9. prisma.fileUpload.create → 201 with row + x-request-id header
 *
 * Magic-byte invariant: sniff happens server-side BEFORE the upload call.
 * Do NOT delegate validation to R2 alone — the route is the single trust
 * boundary for declared-vs-actual MIME parity.
 *
 * ⚠️ Privacy invariant: the R2 `secureUrl` is publicly accessible — anyone
 * with the URL can fetch the file (no auth, no expiry). Safe for avatars /
 * product images / public posts. For private files (KYC docs, invoices, IDs)
 * this route must be wrapped with signed R2 URLs or an owner-gated proxy.
 * The v1 starter ships neither — adding either is project-specific.
 *
 * Key naming: `{userId}/{uuid}` — random UUID prevents collisions and blocks
 * path-traversal via attacker-controlled filename (T-04-02-02). The
 * resulting string is passed to R2 as the object key and stored in
 * `FileUpload.key` (a `.webp` extension is appended when the image was
 * re-encoded — see storage-client.ts).
 *
 * Env is read at handler-call time (never module-top) so vi.stubEnv works in
 * tests and the route picks up env changes without restart.
 */
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import heicConvert from 'heic-convert';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/storage-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Read env at handler-call time so vi.stubEnv works and operators can flip
    // limits without redeploy. Never hoist these to module top.
    const allowedMime = (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '10485760', 10);

    // Probe R2 configuration BEFORE consuming the request body — we want
    // STORAGE_NOT_CONFIGURED to be a cheap 503, not a body-parse-after.
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

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { code: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Read bytes only AFTER size + MIME gates (D-UP-04 — never allocate before
    // the cheap rejections fire).
    const ab = await file.arrayBuffer();
    let buf = Buffer.from(ab);
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // sniffed=false → operator allowed a MIME we don't sniff (e.g. text/csv).
    // sniff.ts logs a warn at boot for those; we accept here per its docs.

    let storedMime = file.type;
    let storedFilename = sanitizeFilename(file.name);

    // HEIC/HEIF lacks broad browser support — transcode to JPEG so the
    // returned R2 URL can be used in <img> tags without a client-side
    // decoder. (storage-client.ts will then re-encode it to WebP anyway.)
    if (HEIC_MIMES.has(storedMime)) {
      try {
        const converted = await heicConvert({
          buffer: buf as unknown as ArrayBufferLike,
          format: 'JPEG',
          quality: 0.9,
        });
        buf = Buffer.from(converted);
        storedMime = 'image/jpeg';
        storedFilename = storedFilename.replace(/\.(heic|heif)$/i, '.jpg');
      } catch {
        return NextResponse.json(
          { code: 'HEIC_CONVERSION_FAILED', message: 'HEIC conversion failed' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // No extension here — storage-client.ts appends `.webp` itself when it
    // re-encodes an image, so the caller-supplied key stays a stable opaque
    // string regardless of the original upload's format.
    const publicId = `${auth.user.sub}/${randomUUID()}`;

    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, storedMime);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const row = await prisma.fileUpload.create({
      data: {
        userId: auth.user.sub,
        key: uploaded.publicId,
        filename: storedFilename,
        mimeType: storedMime,
        sizeBytes: uploaded.bytes,
      },
      select: {
        id: true,
        key: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { ...row, url: uploaded.secureUrl },
      {
        status: 201,
        headers: { 'x-request-id': ctx.requestId },
      },
    );
  });
}
