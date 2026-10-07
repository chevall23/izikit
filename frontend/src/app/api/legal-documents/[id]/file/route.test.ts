// GET /api/legal-documents/[id]/file — owner/admin only, private files
// streamed (never cached), legacy public rows redirected.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/upload/storage-client', () => ({
  PRIVATE_URL_PREFIX: 'private:',
  isPrivateStorageConfigured: vi.fn(() => true),
  uploadBuffer: vi.fn(),
  uploadPrivateBuffer: vi.fn(),
  getPrivateObject: vi.fn(async () => ({
    body: new TextEncoder().encode('%PDF-1.4'),
    contentType: 'application/pdf',
  })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { getPrivateObject } from '@/lib/server/upload/storage-client';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const ctx = { params: Promise.resolve({ id: 'doc-1' }) };
const req = () => new NextRequest('http://test/api/legal-documents/doc-1/file');

const PRIVATE_DOC = {
  userId: 'owner-1',
  url: 'private:legal-documents/owner-1/ID_CARD-x.pdf',
  filename: 'cni.pdf',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'owner-1', email: 'o@x.com' } });
});

describe('GET /api/legal-documents/[id]/file', () => {
  it('401 without a session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({}, { status: 401 }));
    expect((await GET(req(), ctx)).status).toBe(401);
  });

  it('streams a private document to its owner, uncached', async () => {
    prismaMock.legalDocument.findUnique.mockResolvedValue(PRIVATE_DOC as never);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(vi.mocked(getPrivateObject)).toHaveBeenCalledWith(
      'legal-documents/owner-1/ID_CARD-x.pdf',
    );
    expect(await res.text()).toBe('%PDF-1.4');
  });

  it('404 for another (non-admin) user', async () => {
    mockRequireAuth.mockResolvedValueOnce({ user: { sub: 'stranger', email: 's@x.com' } });
    prismaMock.legalDocument.findUnique.mockResolvedValue(PRIVATE_DOC as never);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'USER' } as never);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(vi.mocked(getPrivateObject)).not.toHaveBeenCalled();
  });

  it('lets an admin open it', async () => {
    mockRequireAuth.mockResolvedValueOnce({ user: { sub: 'admin-1', email: 'a@x.com' } });
    prismaMock.legalDocument.findUnique.mockResolvedValue(PRIVATE_DOC as never);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as never);
    expect((await GET(req(), ctx)).status).toBe(200);
  });

  it('redirects a legacy public document to its URL', async () => {
    prismaMock.legalDocument.findUnique.mockResolvedValue({
      ...PRIVATE_DOC,
      url: 'https://pub.r2.dev/legal-documents/owner-1/ID_CARD-x.pdf',
    } as never);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://pub.r2.dev/legal-documents/owner-1/ID_CARD-x.pdf',
    );
  });

  it('404 when the document does not exist', async () => {
    prismaMock.legalDocument.findUnique.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
  });
});
