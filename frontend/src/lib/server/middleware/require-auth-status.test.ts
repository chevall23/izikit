// requireAuth / optionalAuth refuse SUSPENDED accounts even with a token
// whose tokenVersion still matches (minted before the suspension bump).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({
  COOKIE_NAME: 'app-token',
  verifyToken: vi.fn().mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 2 }),
}));

import { requireAuth, optionalAuth } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth — account status', () => {
  it('returns the context for an ACTIVE account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 2,
      status: 'ACTIVE',
    } as never);
    const res = await requireAuth('Bearer t');
    expect(res).toEqual({ user: { sub: 'u1', email: 'a@b.com' } });
  });

  it('returns 403 ACCOUNT_SUSPENDED for a SUSPENDED account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 2,
      status: 'SUSPENDED',
    } as never);
    const res = await requireAuth('Bearer t');
    expect(res).toBeInstanceOf(NextResponse);
    const r = res as NextResponse;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'ACCOUNT_SUSPENDED' });
  });

  it('optionalAuth treats a SUSPENDED account as a guest', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 2,
      status: 'SUSPENDED',
    } as never);
    expect(await optionalAuth('Bearer t')).toBeNull();
  });
});
