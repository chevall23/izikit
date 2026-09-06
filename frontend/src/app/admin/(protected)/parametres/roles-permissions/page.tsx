import {
  UserPlus,
  Filter,
  MoreVertical,
  Crown,
  ShieldCheck,
  Headset,
  Calculator,
  ClipboardList,
  Users,
  Wallet,
  Video,
  ShieldAlert,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminSettingsTabs } from '@/components/admin/AdminSettingsTabs';
import { AdminSettingsSection, AdminSettingsButton } from '@/components/admin/AdminSettingsSection';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import {
  AdminRoleBadge,
  ADMIN_ROLE_LABEL,
  type AdminRoleKey,
} from '@/components/admin/AdminRoleBadge';
import { AdminPermBadge, type AdminPermLevel } from '@/components/admin/AdminPermBadge';

// ── Static mockup data (Banani "Rôles Permissions") ─────────────────────────────

const ROLE_SUMMARY: {
  role: AdminRoleKey;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  count: number;
}[] = [
  { role: 'superadmin', icon: Crown, iconBg: 'bg-sky-100', iconColor: 'text-sky-600', count: 2 },
  {
    role: 'moderator',
    icon: ShieldCheck,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    count: 5,
  },
  {
    role: 'support',
    icon: Headset,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-700',
    count: 3,
  },
  {
    role: 'accounting',
    icon: Calculator,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    count: 2,
  },
];

interface AdminAccount {
  name: string;
  email: string;
  avatarUrl: string;
  role: AdminRoleKey;
  active: boolean;
  lastLogin: string;
}
const ADMIN_ACCOUNTS: AdminAccount[] = [
  {
    name: 'Kofi Mensah',
    email: 'kofi.mensah@habitat-afrik.com',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F3',
    role: 'superadmin',
    active: true,
    lastLogin: "Aujourd'hui, 09:14",
  },
  {
    name: 'Awa Diallo',
    email: 'awa.diallo@habitat-afrik.com',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F1',
    role: 'superadmin',
    active: true,
    lastLogin: 'Hier, 17:42',
  },
  {
    name: 'Serge Akouété',
    email: 's.akouete@habitat-afrik.com',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F5',
    role: 'moderator',
    active: true,
    lastLogin: "Aujourd'hui, 11:05",
  },
  {
    name: 'Fatou Ndiaye',
    email: 'f.ndiaye@habitat-afrik.com',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F4',
    role: 'moderator',
    active: true,
    lastLogin: 'Il y a 2 jours',
  },
  {
    name: 'Abou Traoré',
    email: 'a.traore@habitat-afrik.com',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F7',
    role: 'support',
    active: true,
    lastLogin: "Aujourd'hui, 08:30",
  },
  {
    name: 'Mariam Coulibaly',
    email: 'm.coulibaly@habitat-afrik.com',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F2',
    role: 'accounting',
    active: false,
    lastLogin: 'Il y a 5 jours',
  },
];

const MATRIX_ROLES: AdminRoleKey[] = ['superadmin', 'moderator', 'support', 'accounting'];
const MATRIX_ROLE_ICON: Record<AdminRoleKey, LucideIcon> = {
  superadmin: Crown,
  moderator: ShieldCheck,
  support: Headset,
  accounting: Calculator,
};
const MATRIX_ROLE_ICON_BG: Record<AdminRoleKey, string> = {
  superadmin: 'bg-sky-100',
  moderator: 'bg-violet-100',
  support: 'bg-orange-100',
  accounting: 'bg-emerald-100',
};
const MATRIX_ROLE_ICON_COLOR: Record<AdminRoleKey, string> = {
  superadmin: 'text-sky-600',
  moderator: 'text-violet-600',
  support: 'text-orange-700',
  accounting: 'text-emerald-700',
};

const MATRIX: { module: string; icon: LucideIcon; perms: Record<AdminRoleKey, AdminPermLevel> }[] =
  [
    {
      module: 'Annonces',
      icon: ClipboardList,
      perms: { superadmin: 'full', moderator: 'full', support: 'read', accounting: 'none' },
    },
    {
      module: 'Utilisateurs',
      icon: Users,
      perms: { superadmin: 'full', moderator: 'read', support: 'full', accounting: 'none' },
    },
    {
      module: 'Finances',
      icon: Wallet,
      perms: { superadmin: 'full', moderator: 'none', support: 'none', accounting: 'full' },
    },
    {
      module: 'Visites virtuelles',
      icon: Video,
      perms: { superadmin: 'full', moderator: 'full', support: 'read', accounting: 'none' },
    },
    {
      module: 'Modération',
      icon: ShieldAlert,
      perms: { superadmin: 'full', moderator: 'full', support: 'full', accounting: 'none' },
    },
    {
      module: 'Paramètres',
      icon: Settings2,
      perms: { superadmin: 'full', moderator: 'none', support: 'none', accounting: 'read' },
    },
  ];

const LEGEND: { level: AdminPermLevel; dot: string; label: string }[] = [
  { level: 'full', dot: 'bg-sky-200', label: 'Lecture + écriture' },
  { level: 'read', dot: 'bg-gray-200', label: 'Lecture seule' },
  { level: 'none', dot: 'bg-red-200', label: 'Aucun accès' },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminRolesPermissionsPage() {
  return (
    <AdminShell
      active="settings"
      searchPlaceholder="Rechercher une annonce, un utilisateur, un paiement…"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-brand">
            Paramètres · Rôles &amp; Permissions
          </p>
          <h1 className="font-sora mt-1 text-2xl leading-tight font-bold text-neutral-900">
            Rôles &amp; Permissions
          </h1>
        </div>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          Inviter un admin
        </button>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <AdminSettingsTabs active="roles" />

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <p className="text-[13px] text-gray-400">
            Gérez les comptes admin et leurs niveaux d&apos;accès à la plateforme.
          </p>

          {/* Résumé des rôles */}
          <AdminSettingsSection
            title="Résumé des rôles"
            description="Nombre de comptes par type de rôle admin"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {ROLE_SUMMARY.map((r) => (
                <div
                  key={r.role}
                  className="flex flex-col gap-2.5 rounded-2xl border border-black/[0.08] p-4"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${r.iconBg}`}
                  >
                    <r.icon className={`h-5 w-5 ${r.iconColor}`} aria-hidden />
                  </span>
                  <div className="text-[14px] font-bold text-neutral-900">
                    {ADMIN_ROLE_LABEL[r.role]}
                  </div>
                  <div className="text-[26px] leading-none font-extrabold text-neutral-900">
                    {r.count}
                  </div>
                  <div className="text-[12px] text-gray-400">comptes actifs</div>
                </div>
              ))}
            </div>
          </AdminSettingsSection>

          {/* Comptes administrateurs */}
          <AdminSettingsSection
            title="Comptes administrateurs"
            description="12 comptes admin au total"
            bodyClassName="overflow-x-auto"
            headerRight={
              <AdminSettingsButton icon={<Filter className="h-3.5 w-3.5" aria-hidden />}>
                Filtrer
              </AdminSettingsButton>
            }
          >
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  {['Administrateur', 'Rôle', 'Statut', 'Dernière connexion', ''].map((h) => (
                    <th
                      key={h}
                      className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ADMIN_ACCOUNTS.map((a, i) => (
                  <tr
                    key={a.email}
                    className={`border-t border-black/[0.05] ${i % 2 === 0 ? '' : 'bg-gray-50/60'}`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={a.avatarUrl}
                          alt=""
                          className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {a.name}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <AdminRoleBadge role={a.role} />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <AdminStatusBadge tone={a.active ? 'success' : 'neutral'}>
                        {a.active ? 'Actif' : 'Inactif'}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {a.lastLogin}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <button
                        type="button"
                        aria-label={`Actions — ${a.name}`}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100"
                      >
                        <MoreVertical className="h-4 w-4 text-gray-400" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminSettingsSection>

          {/* Matrice des permissions */}
          <AdminSettingsSection
            title="Matrice des permissions"
            description="Droits d'accès par rôle et par module"
            bodyClassName="overflow-x-auto"
            headerRight={
              <div className="flex flex-wrap items-center gap-3">
                {LEGEND.map((l) => (
                  <span
                    key={l.level}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400"
                  >
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-sm ${l.dot}`} aria-hidden />
                    {l.label}
                  </span>
                ))}
              </div>
            }
          >
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className="min-w-[140px] border-b border-black/[0.08] px-4 py-3 text-left text-[12px] font-bold text-gray-400">
                    Module
                  </th>
                  {MATRIX_ROLES.map((role) => {
                    const Icon = MATRIX_ROLE_ICON[role];
                    return (
                      <th
                        key={role}
                        className="border-b border-black/[0.08] px-4 py-3 text-center text-[12px] font-bold whitespace-nowrap text-gray-400"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-[10px] ${MATRIX_ROLE_ICON_BG[role]}`}
                          >
                            <Icon
                              className={`h-3.5 w-3.5 ${MATRIX_ROLE_ICON_COLOR[role]}`}
                              aria-hidden
                            />
                          </span>
                          {ADMIN_ROLE_LABEL[role]}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row, i) => (
                  <tr
                    key={row.module}
                    className={`border-b border-black/[0.04] last:border-b-0 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                  >
                    <td className="px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                      <span className="flex items-center gap-2">
                        <row.icon className="h-[15px] w-[15px] text-gray-400" aria-hidden />
                        {row.module}
                      </span>
                    </td>
                    {MATRIX_ROLES.map((role) => (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <AdminPermBadge level={row.perms[role]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminSettingsSection>
        </div>
      </div>
    </AdminShell>
  );
}
