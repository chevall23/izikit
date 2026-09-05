// ADMIN-ACCESS-REQUEST-02 — POST /api/public/admin-access-requests/verify-email tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { POST } from './route';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/public/admin-access-requests/verify-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FUTURE = new Date(Date.now() + 10 * 60 * 1000);
const PAST = new Date(Date.now() - 10 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.user.findMany.mockResolvedValue([] as never);
});

describe('POST /api/public/admin-access-requests/verify-email', () => {
  it('marks the request PENDING_REVIEW on a correct, unexpired code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.adminAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDING_EMAIL' },
      data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
    });
  });

  it('notifies SUPERADMIN users on success', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.user.findMany.mockResolvedValue([{ email: 'super@example.com' }] as never);
    const enqueue = vi.fn().mockResolvedValue('job-1');
    vi.mocked(getEmailQueue).mockReturnValue({ enqueue } as never);

    await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ to: 'super@example.com' }));
  });

  it('returns VERIFICATION_CODE_INVALID for an unknown email', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'unknown@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_INVALID for a wrong code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ZZZZZZZZ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
    expect(prismaMock.adminAccessRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns VERIFICATION_CODE_INVALID for an expired code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: PAST,
    } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('rejects malformed code shape with VALIDATION_FAILED', async () => {
    const res = await POST(makeReq({ email: 'req@example.com', code: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });
});
