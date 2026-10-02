// POST /api/auth/resend-verification tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The route fails closed without Redis; a truthy stub + a pass-through limiter
// lets the happy path run.
vi.mock('@/lib/server/redis', () => ({ redis: {} }));
vi.mock('@/lib/server/middleware/rate-limit-by-email', () => ({
  createEmailLimiter: () => ({ check: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/lib/server/outbox', () => ({
  enqueueOutbox: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
}));
vi.mock('@/lib/server/outbox/nudge', () => ({
  nudgeOutbox: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from './route';
import { enqueueOutbox } from '@/lib/server/outbox';
import { nudgeOutbox } from '@/lib/server/outbox/nudge';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('re-issues an EMAIL_VERIFY code and sends it immediately for an unverified user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      emailVerifiedAt: null,
    } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const codeArg = prismaMock.verificationCode.create.mock.calls[0]?.[0];
    expect(codeArg?.data?.type).toBe('EMAIL_VERIFY');
    const outboxArg = (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(outboxArg?.kind).toBe('email.verification_code');
    expect(nudgeOutbox).toHaveBeenCalledWith('resend-verification');
  });

  it('returns the same 200 without issuing or sending anything for an already-verified user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      emailVerifiedAt: new Date(),
    } as never);

    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(enqueueOutbox).not.toHaveBeenCalled();
    expect(nudgeOutbox).not.toHaveBeenCalled();
  });

  it('returns the same 200 without sending anything for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'nobody@b.com' }));
    expect(res.status).toBe(200);
    expect(enqueueOutbox).not.toHaveBeenCalled();
    expect(nudgeOutbox).not.toHaveBeenCalled();
  });
});
