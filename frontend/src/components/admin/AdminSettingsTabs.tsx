import Link from 'next/link';
import { Settings, Globe, Coins, ShieldCheck, BellDot, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSettingsTabKey = 'general' | 'countries' | 'pricing' | 'roles' | 'notifications';

interface Tab {
  key: AdminSettingsTabKey;
  label: string;
  icon: LucideIcon;
  href: string;
}

// Only "Général" has a built screen so far — the rest link to their own
// `/admin/parametres/*` route once that Banani screen is implemented.
const TABS: Tab[] = [
  { key: 'general', label: 'Général', icon: Settings, href: '/admin/parametres' },
  {
    key: 'countries',
    label: 'Pays & devises',
    icon: Globe,
    href: '/admin/parametres/pays-devises',
  },
  { key: 'pricing', label: 'Tarification', icon: Coins, href: '/admin/parametres/tarification' },
  {
    key: 'roles',
    label: 'Rôles & permissions',
    icon: ShieldCheck,
    href: '/admin/parametres/roles-permissions',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: BellDot,
    href: '/admin/parametres/notifications',
  },
];

/** Left-rail vertical tab list shared by every `/admin/parametres/*` screen. */
export function AdminSettingsTabs({ active }: { active: AdminSettingsTabKey }) {
  return (
    <nav className="flex w-[220px] flex-shrink-0 flex-col gap-0.5 rounded-2xl border border-black/[0.08] bg-white p-2.5">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px]',
              isActive
                ? 'bg-brand/10 font-semibold text-brand'
                : 'font-medium text-gray-400 hover:bg-gray-50',
            )}
          >
            <tab.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="truncate">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
