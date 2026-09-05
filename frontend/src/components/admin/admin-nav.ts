import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Siren,
  Users,
  Wallet,
  Video,
  ShieldAlert,
  Settings2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavKey =
  | 'dashboard'
  | 'annonces'
  | 'demande'
  | 'alerte-secteur'
  | 'users'
  | 'finance'
  | 'vr'
  | 'support'
  | 'settings'
  | 'access-requests';

export interface AdminNavEntry {
  key: AdminNavKey;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Static count badge from the Banani mockup — no live data this pass. */
  count?: number;
}

// Routes point at `/admin/*` slugs; only `/admin` (dashboard) exists so far,
// the rest are placeholders the upcoming back-office screens will fill in.
export const ADMIN_NAV: AdminNavEntry[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, href: '/admin', count: 4 },
  { key: 'annonces', label: 'Gestion des annonces', icon: ClipboardList, href: '/admin/annonces' },
  {
    key: 'demande',
    label: 'Demande immobilière',
    icon: FileText,
    href: '/admin/demandes',
    count: 12,
  },
  {
    key: 'alerte-secteur',
    label: 'Alerte Secteur',
    icon: Siren,
    href: '/admin/alerte-secteur',
    count: 6,
  },
  { key: 'users', label: 'Utilisateurs', icon: Users, href: '/admin/utilisateurs' },
  { key: 'finance', label: 'Finances & jetons', icon: Wallet, href: '/admin/finances' },
  { key: 'vr', label: 'Visites virtuelles', icon: Video, href: '/admin/visites-virtuelles' },
  {
    key: 'support',
    label: 'Modération & support',
    icon: ShieldAlert,
    href: '/admin/support',
    count: 19,
  },
  { key: 'settings', label: 'Paramètres', icon: Settings2, href: '/admin/parametres' },
  {
    key: 'access-requests',
    label: "Demandes d'accès admin",
    icon: UserPlus,
    href: '/admin/demandes-acces',
  },
];

export const ADMIN_COUNTRY_PILLS = ['BJ', 'TG', 'CI', 'SN'] as const;
