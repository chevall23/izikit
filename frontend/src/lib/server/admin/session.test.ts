// Tests for getAdminSession() — the RSC-friendly admin probe.
// next/headers is mocked with a controllable cookie jar; verifyToken is
// partial-mocked so token values are arbitrary fixtures.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

import { verifyToken } from '@/lib/server/auth';
import { getAdminSession } from './session';

const TOKEN_COOKIE = 'app-token';

function seedUser(over: Record<string, unknown> = {}) {
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'u1',
    email: 'admin@habitatafrik.test',
    role: 'ADMIN',
    tokenVersion: 0,
    status: 'ACTIVE',
    ...over,
  } as never);
}

beforeEach(() => {
  cookieJar.clear();
  vi.mocked(verifyToken).mockReset();
  prismaMock.user.findUnique.mockReset();
});

describe('getAdminSession', () => {
  it('valid ADMIN token → returns the admin identity', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'admin@habitatafrik.test' });
    seedUser();

    await expect(getAdminSession()).resolves.toEqual({
      id: 'u1',
      email: 'admin@habitatafrik.test',
      role: 'ADMIN',
    });
  });

  it('valid SUPERADMIN token → returns role SUPERADMIN', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    seedUser({ role: 'SUPERADMIN' });

    await expect(getAdminSession()).resolves.toMatchObject({ role: 'SUPERADMIN' });
  });

  it('no token cookie → null (and no DB hit)', async () => {
    await expect(getAdminSession()).resolves.toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('invalid / expired JWT → null', async () => {
    cookieJar.set(TOKEN_COOKIE, 'garbage');
    vi.mocked(verifyToken).mockResolvedValue(null);

    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('role USER → null', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    seedUser({ role: 'USER' });

    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('tokenVersion mismatch (password changed) → null', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com', tokenVersion: 0 });
    seedUser({ tokenVersion: 1 });

    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('status SUSPENDED → null even with an ADMIN role', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    seedUser({ status: 'SUSPENDED' });

    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('user row gone → null', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'ghost', email: 'a@b.com' });
    prismaMock.user.findUnique.mockResolvedValue(null as never);

    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('transient DB error → null (fail closed)', async () => {
    cookieJar.set(TOKEN_COOKIE, 'valid');
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    prismaMock.user.findUnique.mockRejectedValue(new Error('connection reset') as never);

    await expect(getAdminSession()).resolves.toBeNull();
  });
});
