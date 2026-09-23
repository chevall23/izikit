// Tests for POST /api/legal-documents/submit — batch upload + token debit.
// Mock strategy mirrors ../route.test.ts (R2 via storage-mock,
// requireAuth/verifyCsrf mocked directly) plus a synthetic $transaction tx
// client (see withdrawals/route.test.ts for the pattern).
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextResponse } from 'next/server';
import { mockStorageClient } from '@/test-utils/storage-mock';

const cl = mockStorageClient();

vi.mock('@/lib/server/upload/storage-client', () => ({
  uploadBuffer: vi.fn((publicId: string, body: Buffer) => cl.uploadBuffer(publicId, body)),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {
    constructor() {
      super('Storage not configured');
      this.name = 'StorageNotConfiguredError';
    }
  },
}));

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 't@e.com' } })),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

const findMany = vi.fn(async () => [] as { type: string; status: string }[]);
const walletFindUnique = vi.fn(async () => ({ balance: 10 }) as { balance: number } | null);

const txLegalDocumentUpsert = vi.fn(async (args: unknown) => ({
  type: (args as { where: { userId_type: { type: string } } }).where.userId_type.type,
  status: 'PENDING',
  url: 'https://cdn.test-bucket.example/test/x.pdf',
  filename: 'doc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 4,
  expiresAt: null,
  rejectionReason: null,
  createdAt: new Date(),
}));
const txWalletUpdate = vi.fn(async () => ({ balance: 7 }));
const txTokenTransactionCreate = vi.fn(async () => ({}));
const txOutboxCreate = vi.fn(async () => ({ id: 'oe_1' }));

const txClient = {
  legalDocument: { upsert: txLegalDocumentUpsert },
  tokenWallet: { update: txWalletUpdate },
  tokenTransaction: { create: txTokenTransactionCreate },
  outboxEvent: { create: txOutboxCreate },
};

const $transaction = vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient));

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    legalDocument: { findMany },
    tokenWallet: { findUnique: walletFindUnique },
    $transaction,
  },
}));

beforeEach(() => {
  vi.stubEnv('R2_ACCOUNT_ID', 'test-account');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
  vi.stubEnv('R2_BUCKET_NAME', 'test-bucket');
  vi.stubEnv('R2_PUBLIC_URL', 'https://cdn.test-bucket.example');
  vi.stubEnv('LEGAL_DOCUMENTS_ADMIN_EMAIL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  walletFindUnique.mockResolvedValue({ balance: 10 });
});

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function pdfFile(name: string) {
  return new File([PDF_BYTES], name, { type: 'application/pdf' });
}

function makeReq(opts: {
  files?: Partial<Record<'RCCM' | 'TAX_CERTIFICATE' | 'ID_CARD', File>>;
  csrf?: boolean;
}) {
  const fd = new FormData();
  for (const [type, file] of Object.entries(opts.files ?? {})) {
    fd.append(type, file);
  }
  const headers = new Headers();
  if (opts.csrf !== false) headers.set('x-csrf-token', 'test-csrf');
  return new Request(new URL('http://localhost/api/legal-documents/submit'), {
    method: 'POST',
    body: fd,
    headers,
  });
}

const ALL_THREE = {
  RCCM: pdfFile('rccm.pdf'),
  TAX_CERTIFICATE: pdfFile('tax.pdf'),
  ID_CARD: pdfFile('id.pdf'),
};

describe('POST /api/legal-documents/submit', () => {
  it('uploads all 3, debits 1 token per file, and returns the new balance', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documents).toHaveLength(3);
    expect(body.balance).toBe(7);
    expect(txLegalDocumentUpsert).toHaveBeenCalledTimes(3);
    expect(txWalletUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { balance: { decrement: 3 } },
    });
    expect(txTokenTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'USAGE', amount: -3 }),
      }),
    );
  });

  it('skips the admin email when LEGAL_DOCUMENTS_ADMIN_EMAIL is unset', async () => {
    const { POST } = await import('./route');
    await POST(makeReq({ files: ALL_THREE }) as never);
    expect(txOutboxCreate).not.toHaveBeenCalled();
  });

  it('enqueues the admin email when LEGAL_DOCUMENTS_ADMIN_EMAIL is set', async () => {
    vi.stubEnv('LEGAL_DOCUMENTS_ADMIN_EMAIL', 'admin@example.com');
    const { POST } = await import('./route');
    await POST(makeReq({ files: ALL_THREE }) as never);
    expect(txOutboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'email.legal_documents_submitted' }),
      }),
    );
  });

  it('missing a required document returns 400 MISSING_DOCUMENTS', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({
        files: { RCCM: pdfFile('rccm.pdf'), TAX_CERTIFICATE: pdfFile('tax.pdf') },
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_DOCUMENTS');
    expect(body.missing).toEqual(['ID_CARD']);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('a verified type already locked is excluded from the required set', async () => {
    findMany.mockResolvedValueOnce([{ type: 'ID_CARD', status: 'VERIFIED' }]);
    const { POST } = await import('./route');
    const res = await POST(
      makeReq({
        files: { RCCM: pdfFile('rccm.pdf'), TAX_CERTIFICATE: pdfFile('tax.pdf') },
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
  });

  it('resubmitting a verified type returns 409 DOCUMENT_VERIFIED', async () => {
    findMany.mockResolvedValueOnce([{ type: 'ID_CARD', status: 'VERIFIED' }]);
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DOCUMENT_VERIFIED');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('insufficient token balance returns 422 and charges nothing', async () => {
    walletFindUnique.mockResolvedValueOnce({ balance: 2 });
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('INSUFFICIENT_TOKENS');
    expect(body.required).toBe(3);
    expect(body.balance).toBe(2);
    expect(cl.uploadBuffer).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it('no wallet row (never purchased) is treated as balance 0 and blocks', async () => {
    walletFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.balance).toBe(0);
  });

  it('mime not in the pdf/jpeg/png allowlist returns 415', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'a.gif', {
      type: 'image/gif',
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: { ...ALL_THREE, ID_CARD: gif } }) as never);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe('INVALID_MIME');
  });

  it('magic byte mismatch returns 415', async () => {
    const fake = new File([PDF_BYTES], 'a.png', { type: 'image/png' });
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: { ...ALL_THREE, ID_CARD: fake } }) as never);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe('MAGIC_BYTE_MISMATCH');
  });

  it('storage not configured (env missing) returns 503', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', '');
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('csrf missing returns 403', async () => {
    const { verifyCsrf } = await import('@/lib/server/auth');
    (verifyCsrf as unknown as Mock).mockReturnValueOnce(new Response(null, { status: 403 }));
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE, csrf: false }) as never);
    expect(res.status).toBe(403);
  });

  it('no auth returns 401', async () => {
    const { requireAuth } = await import('@/lib/server/middleware');
    (requireAuth as unknown as Mock).mockReturnValueOnce(
      NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(401);
  });

  it('upload failed (R2 throws) returns 502 and charges nothing', async () => {
    const { uploadBuffer } = await import('@/lib/server/upload/storage-client');
    (uploadBuffer as unknown as Mock).mockImplementationOnce(async () => {
      throw new Error('R2 down');
    });
    const { POST } = await import('./route');
    const res = await POST(makeReq({ files: ALL_THREE }) as never);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UPLOAD_FAILED');
    expect($transaction).not.toHaveBeenCalled();
  });
});
