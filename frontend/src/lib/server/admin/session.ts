/**
 * Server-side admin session probe for React Server Components.
 *
 * `requireAdmin()` in `../middleware` is route-handler shaped — it returns a
 * `NextResponse` to short-circuit a handler. Server Components (layouts,
 * pages) can't use that; they need a plain value plus `redirect()`. This
 * helper is the RSC-friendly counterpart: it reads the auth cookie, verifies
 * the JWT, re-reads the user's role/status from the DB, and returns the
 * admin identity or `null`.
 *
 * Rejections (all → `null`, caller redirects to /admin/connexion):
 *   - no access-token cookie
 *   - JWT invalid / expired / wrong type (refresh token)
 *   - user row gone, or a transient DB error (fail closed)
 *   - `tokenVersion` mismatch (password change / forced logout bumped it)
 *   - `status === 'SUSPENDED'` (back-office access revoked immediately)
 *   - role below ADMIN
 *
 * The DB re-read is deliberate: an in-flight role change or suspension takes
 * effect on the very next navigation, without waiting for the 15-minute
 * access token to expire.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '../auth';
import { prisma } from '../prisma';
import { roleRank, type AdminRole } from '../middleware/require-admin';

export interface AdminSession {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, tokenVersion: true, status: true },
    })
    .catch(() => null);
  if (!user) return null;

  if (user.tokenVersion !== (payload.tokenVersion ?? 0)) return null;
  if (user.status === 'SUSPENDED') return null;

  const role = (user.role as AdminRole) ?? 'USER';
  if (roleRank(role) < roleRank('ADMIN')) return null;

  return { id: user.id, email: user.email, role: role as 'ADMIN' | 'SUPERADMIN' };
}
