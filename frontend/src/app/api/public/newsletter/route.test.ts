// PUBLIC-NEWSLETTER-01 — POST /api/public/newsletter tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makePost(body: unknown, opts: { ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? `test-ip-${Math.random()}`,
  };
  return new NextRequest('http://test/api/public/newsletter', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  prismaMock.newsletterSubscriber.upsert.mockResolvedValue({
    id: 'sub_1',
    email: 'awa@example.com',
    status: 'ACTIVE',
  } as never);
});

describe('POST /api/public/newsletter', () => {
  it('400s on an invalid email', async () => {
    const res = await POST(makePost({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('upserts the subscriber and returns 201', async () => {
    const res = await POST(makePost({ email: 'awa@example.com' }));
    expect(res.status).toBe(201);
    expect(prismaMock.newsletterSubscriber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'awa@example.com' },
        create: { email: 'awa@example.com', status: 'ACTIVE' },
        update: { status: 'ACTIVE', unsubscribedAt: null },
      }),
    );
  });

  it('lowercases and trims the email before upserting', async () => {
    await POST(makePost({ email: '  AWA@Example.com  ' }));
    expect(prismaMock.newsletterSubscriber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'awa@example.com' } }),
    );
  });

  it('rejects a 6th request for the same email within the window', async () => {
    const email = `fixed-rl-${Math.random()}@example.com`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(makePost({ email }, { ip: 'shared-ip' }));
      expect(res.status).toBe(201);
    }
    const res = await POST(makePost({ email }, { ip: 'shared-ip' }));
    expect(res.status).toBe(429);
  });

  it('rejects a 21st request from the same IP within the window, even with distinct emails', async () => {
    const ip = 'shared-ip-volume-abuse';
    for (let i = 0; i < 20; i++) {
      const res = await POST(makePost({ email: `bulk-${i}@example.com` }, { ip }));
      expect(res.status).toBe(201);
    }
    const res = await POST(makePost({ email: 'bulk-20@example.com' }, { ip }));
    expect(res.status).toBe(429);
  });
});
