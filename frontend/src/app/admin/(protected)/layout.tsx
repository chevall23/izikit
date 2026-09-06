import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/server/admin/session';

/**
 * Server-side gate for the whole admin back-office.
 *
 * Every page under `app/admin/(protected)/` renders through this layout.
 * `getAdminSession()` re-reads the caller's role/status from the DB on each
 * navigation, so a revoked admin or a suspension takes effect immediately —
 * no waiting for the access token to expire.
 *
 * `/admin/connexion` and `/admin/inscription` live OUTSIDE this route group
 * on purpose (a logged-out visitor must be able to reach them), so this
 * redirect can't loop.
 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/connexion');

  return <>{children}</>;
}
