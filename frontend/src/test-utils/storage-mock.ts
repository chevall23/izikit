// Mock storage (R2) client factory.
//
// The upload route tests inject this via `vi.mock('@/lib/server/upload/storage-client')`
// so the real S3/R2 SDK (and `sharp`) never gets called in a test process.
//
// Tests can override the upload branch by passing `onUpload` — passing a
// vi.fn that throws lets a test simulate an R2 5xx, network failures, etc.
// Default returns a happy `{ publicId, secureUrl, bytes }` shape.
import { vi, type Mock } from 'vitest';

export interface MockStorageOptions {
  /**
   * Override for `uploadBuffer`. If omitted, returns a happy
   * `{ publicId, secureUrl: 'https://cdn.test-bucket.example/<id>', bytes }`.
   * Throw to simulate upload failure.
   */
  onUpload?: Mock;
}

export interface MockUploadResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
}

export interface MockStorageClient {
  uploadBuffer: (publicId: string, body: Buffer) => Promise<MockUploadResult>;
}

/**
 * Build a mock storage uploader. Inject via:
 * `vi.mock('@/lib/server/upload/storage-client', () => ({
 *   uploadBuffer: vi.fn((id, body) => mockStorageClient().uploadBuffer(id, body)),
 *   StorageNotConfiguredError: class extends Error { ... },
 * }))`.
 */
export function mockStorageClient(opts: MockStorageOptions = {}): MockStorageClient {
  return {
    uploadBuffer: vi.fn(async (publicId: string, body: Buffer) => {
      if (opts.onUpload) return (await opts.onUpload(publicId, body)) as MockUploadResult;
      return {
        publicId,
        secureUrl: `https://cdn.test-bucket.example/${publicId}`,
        bytes: body.length,
      };
    }),
  };
}
