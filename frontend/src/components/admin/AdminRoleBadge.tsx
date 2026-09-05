import { cn } from '@/lib/utils';

export type AdminRoleKey = 'superadmin' | 'moderator' | 'support' | 'accounting';

export const ADMIN_ROLE_LABEL: Record<AdminRoleKey, string> = {
  superadmin: 'Super Admin',
  moderator: 'Modérateur',
  support: 'Support',
  accounting: 'Comptabilité',
};

const ROLE_TONE: Record<AdminRoleKey, string> = {
  superadmin: 'bg-sky-100 text-sky-600',
  moderator: 'bg-violet-100 text-violet-600',
  support: 'bg-orange-100 text-orange-700',
  accounting: 'bg-emerald-100 text-emerald-700',
};

/**
 * Fixed-palette role tag (Super Admin / Modérateur / Support / Comptabilité) —
 * deliberately its own 4-hue set rather than the generic `AdminStatusBadge`
 * tones, since these colors identify a *role*, not a state. Reused by the
 * admin-accounts table and the role-summary cards; the future "Utilisateurs"
 * screen will likely need the same tags.
 */
export function AdminRoleBadge({ role }: { role: AdminRoleKey }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap',
        ROLE_TONE[role],
      )}
    >
      {ADMIN_ROLE_LABEL[role]}
    </span>
  );
}
