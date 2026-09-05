// ADMIN-ACCESS-REQUEST-01 — POST /api/public/admin-access-requests tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth/dummy-bcrypt', () => ({
  dummyBcryptCompare: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/auth/hibp', () => ({
  isPwned: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { POST } from './route';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { VERIFICATION_CODE_REGEX } from '@/lib/server/auth';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/public/admin-access-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Kofi Mensah',
    email: 'new-admin@example.com',
    phone: '+22967000000',
    password: 'a-strong-passphrase',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
});

describe('POST /api/public/admin-access-requests', () => {
  it('creates a new request and enqueues the verification email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminAccessRequest.create.mockResolvedValue({ id: 'req-1' } as never);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.adminAccessRequest.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.adminAccessRequest.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      name: 'Kofi Mensah',
      email: 'new-admin@example.com',
      phone: '+22967000000',
    });
    expect(createArg?.data?.verificationCode).toMatch(VERIFICATION_CODE_REGEX);
  });

  it('returns identical 201 + dummy-bcrypts when a User already has this email (enumeration-resist)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-existing' } as never);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAccessRequest.create).not.toHaveBeenCalled();
  });

  it('returns identical 201 + dummy-bcrypts when an active request already exists for this email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({ id: 'req-existing' } as never);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAccessRequest.create).not.toHaveBeenCalled();
  });

  it('rejects banned passwords with PASSWORD_BANNED before any DB lookup', async () => {
    const res = await POST(makeReq(baseBody({ password: 'password' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_BANNED');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects short passwords with PASSWORD_TOO_SHORT', async () => {
    const res = await POST(makeReq(baseBody({ password: 'ab' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_TOO_SHORT');
  });

  it('rejects malformed bodies with VALIDATION_FAILED', async () => {
    const res = await POST(
      makeReq({ name: '', email: 'not-an-email', phone: '123', password: 'x' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 429 TOO_MANY_ACCESS_REQUEST_ATTEMPTS when the per-email limit is hit', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminAccessRequest.create.mockResolvedValue({ id: 'req-rate' } as never);

    const calls = await Promise.all(
      Array.from({ length: 6 }, () =>
        POST(makeReq(baseBody({ email: 'rate-target@example.com' }))),
      ),
    );
    const limited = calls.find((r) => r.status === 429);
    expect(limited).toBeDefined();
    const body = await limited!.json();
    expect(body.error).toBe('TOO_MANY_ACCESS_REQUEST_ATTEMPTS');
  });
});
