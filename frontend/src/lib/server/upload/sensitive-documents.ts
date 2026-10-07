// Sensitive documents (legal / KYC documents, listing title deeds): stored in
// the PRIVATE R2 bucket and only ever served through authenticated routes —
// never through a public URL.
//
//   - uploadSensitiveDocument(): drop-in for uploadBuffer(); its `secureUrl`
//     is the value to persist in the row's `url` column (`private:<key>`).
//   - documentHref(): what API responses expose as `url` — the authenticated
//     file route for private rows, the old public URL for rows uploaded
//     before the private bucket existed (until scripts/migrate-private-documents.ts runs).
//   - serveStoredDocument(): the file routes' response body.
//
// Without R2_PRIVATE_BUCKET_NAME the upload falls back to the public bucket
// (loud warning) so document submission keeps working while the bucket is
// being provisioned; the migration script moves those rows later.
import 'server-only';
import { NextResponse } from 'next/server';
import { log } from '@/lib/server/observability/log';
import {
  PRIVATE_URL_PREFIX,
  getPrivateObject,
  isPrivateStorageConfigured,
  uploadBuffer,
  uploadPrivateBuffer,
  type UploadResult,
} from './storage-client';

export async function uploadSensitiveDocument(
  keyBase: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  if (isPrivateStorageConfigured()) {
    const up = await uploadPrivateBuffer(keyBase, body, contentType);
    return { publicId: up.key, secureUrl: `${PRIVATE_URL_PREFIX}${up.key}`, bytes: up.bytes };
  }
  log.warn('sensitive document stored in the PUBLIC bucket: R2_PRIVATE_BUCKET_NAME is not set', {
    keyBase,
  });
  return uploadBuffer(keyBase, body, contentType);
}

export function isPrivateDocumentUrl(storedUrl: string): boolean {
  return storedUrl.startsWith(PRIVATE_URL_PREFIX);
}

/** The `url` an API response exposes for a stored document. */
export function documentHref(storedUrl: string, filePath: string): string {
  return isPrivateDocumentUrl(storedUrl) ? filePath : storedUrl;
}

export function legalDocumentFilePath(documentId: string): string {
  return `/api/legal-documents/${documentId}/file`;
}

export function listingDocumentFilePath(listingId: string, documentId: string): string {
  return `/api/listings/${listingId}/documents/${documentId}/file`;
}

/**
 * Response for an authorized download: streams a private object (never
 * cached, never sniffed), or redirects to the legacy public URL.
 */
export async function serveStoredDocument(doc: {
  url: string;
  filename: string;
}): Promise<NextResponse> {
  if (!isPrivateDocumentUrl(doc.url)) {
    return NextResponse.redirect(doc.url, 302);
  }
  const obj = await getPrivateObject(doc.url.slice(PRIVATE_URL_PREFIX.length));
  return new NextResponse(Buffer.from(obj.body), {
    status: 200,
    headers: {
      'Content-Type': obj.contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
