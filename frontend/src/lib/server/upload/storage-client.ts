// Lazy-initialized Cloudflare R2 (S3-compatible) singleton + uploader.
//
// Replaces the earlier Cloudinary-backed client: R2's free tier (10GB
// storage, ZERO egress/bandwidth fees) is cheaper at scale than Cloudinary's
// credit-based pricing, and raster images are compressed/re-encoded to WebP
// server-side (via `sharp`) before the PUT, so storage stays low without
// depending on a paid transformation product.
//
// Why lazy? `new S3Client({...})` itself doesn't throw on missing creds —
// calls would only fail at request time with an opaque error. Worse, our
// route should return a clean 503 STORAGE_NOT_CONFIGURED instead of a
// generic 500. By gating configuration on the five required envs
// (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
// R2_PUBLIC_URL), we throw a typed `StorageNotConfiguredError` synchronously
// on first use. Routes catch `instanceof` and translate to 503.
//
//   Additionally, this avoids reading `process.env` at module top-level —
//   which would lock in stale values for tests that mutate the env.
//
// Pitfall (env.ts Zod rejection): R2_* keys are deliberately NOT added to
// `frontend/src/lib/server/env.ts`'s Zod schema, for the same reason the
// Cloudinary keys weren't — the schema rejects empty strings, which would
// refuse to boot the whole app whenever storage is unconfigured (dev / CI).
// Lazy-init handles `?? ''` empty-as-absent directly.
import 'server-only';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

/**
 * Thrown by `configureOnce()` when any of `R2_ACCOUNT_ID`,
 * `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, or
 * `R2_PUBLIC_URL` is missing/empty. The upload route catches this
 * `instanceof` and returns 503 `{ code: 'STORAGE_NOT_CONFIGURED' }`. The
 * error message intentionally avoids echoing any env values — only names —
 * so a stack trace surfaced via Sentry never leaks a partial credential.
 */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'Storage not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL missing or empty)',
    );
    this.name = 'StorageNotConfiguredError';
  }
}

/**
 * Result shape returned by `uploadBuffer()`. Mirrors the small subset the
 * upload routes consume; we don't leak the full S3 response upstream.
 */
export interface UploadResult {
  /** R2 object key — stored as `FileUpload.key` / `ListingPhoto.key`. */
  publicId: string;
  /** Public HTTPS URL the browser hits directly (custom domain or r2.dev). */
  secureUrl: string;
  /** Stored byte length (post-compression for images). */
  bytes: number;
}

let _client: S3Client | null = null;
let _bucket: string | null = null;
let _publicUrl: string | null = null;

function configureOnce(): { client: S3Client; bucket: string; publicUrl: string } {
  if (_client && _bucket && _publicUrl) {
    return { client: _client, bucket: _bucket, publicUrl: _publicUrl };
  }

  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket = process.env.R2_BUCKET_NAME ?? '';
  const publicUrl = process.env.R2_PUBLIC_URL ?? '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new StorageNotConfiguredError();
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  _bucket = bucket;
  _publicUrl = publicUrl.replace(/\/+$/, '');
  return { client: _client, bucket: _bucket, publicUrl: _publicUrl };
}

// Only raster formats we already allow through the MIME allowlist + magic-
// byte sniff (see sniff.ts) are re-encoded. PDFs (legal documents), SVGs,
// and anything else pass through untouched.
const COMPRESSIBLE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;

/**
 * Re-encode raster images to WebP, capped at MAX_DIMENSION on the long edge,
 * before they ever hit R2 — keeps storage AND bandwidth down (R2 has no
 * egress fee, but smaller files still mean faster page loads). Falls back to
 * the original bytes on any decode failure: this runs AFTER the route's
 * magic-byte sniff, so it's a best-effort optimization, not a trust
 * boundary — a corrupt image should still upload as-is rather than 502.
 */
async function optimizeIfImage(
  body: Buffer,
  contentType: string,
): Promise<{ body: Buffer; contentType: string; ext: string }> {
  if (!COMPRESSIBLE_IMAGE_MIMES.has(contentType)) {
    return { body, contentType, ext: '' };
  }
  try {
    const optimized = await sharp(body)
      .rotate() // bake in EXIF orientation before we strip metadata below
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { body: optimized, contentType: 'image/webp', ext: '.webp' };
  } catch {
    return { body, contentType, ext: '' };
  }
}

/**
 * Upload a buffer to R2. Images are compressed/re-encoded to WebP first (see
 * `optimizeIfImage`); everything else is stored as-is. Throws
 * `StorageNotConfiguredError` when the required envs are missing; the route
 * translates that to 503.
 *
 * `publicId` is supplied by the caller (the upload routes build a path-like
 * key, e.g. `{userId}/{uuid}` or `listings/{id}/{uuid}`) — we only append a
 * `.webp` extension when the object was actually re-encoded.
 */
export async function uploadBuffer(
  publicId: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const { client, bucket, publicUrl } = configureOnce();

  const {
    body: finalBody,
    contentType: finalContentType,
    ext,
  } = await optimizeIfImage(body, contentType);
  const key = `${publicId}${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: finalBody,
      ContentType: finalContentType,
    }),
  );

  return {
    publicId: key,
    secureUrl: `${publicUrl}/${key}`,
    bytes: finalBody.length,
  };
}

/**
 * Test-only escape hatch — clears the cached configuration so a test can
 * mutate `process.env.R2_*` and re-trigger lazy init. Never call this from
 * application code.
 *
 * @internal
 */
export function __resetStorageSingleton(): void {
  _client = null;
  _bucket = null;
  _publicUrl = null;
}
