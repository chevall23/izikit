import Link from 'next/link';
import { Building2, ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, ADMIN_COUNTRY_PILLS, type AdminNavKey } from './admin-nav';

/**
 * Inner content of the admin sidebar (brand, country switcher, country pills,
 * nav list, logout). Shared verbatim by the desktop `<aside>` and the mobile
 * slide-in drawer so the two never drift.
 */
export function AdminSidebarNav({
  active,
  onNavigate = () => {},
}: {
  active: AdminNavKey;
  /** Called when a nav link is tapped — lets the mobile drawer close itself. */
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-[22px]">
      <div className="flex items-center gap-3 px-1.5 pt-2 pb-1">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
          <Building2 className="h-5 w-5 text-brand" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-sora text-[16px] font-bold text-gray-700">Habitat-Afrik</span>
          <span className="text-[12px] text-gray-400">Administration</span>
        </span>
      </div>

      <button
        type="button"
        className="flex items-center justify-between gap-2.5 rounded-lg bg-gray-100 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-brand">
            AF
          </span>
          <span className="min-w-0">
            <span className="mb-0.5 block text-[11px] text-gray-400">Vue active</span>
            <span className="block truncate text-[13px] font-semibold text-gray-700">
              Multi-pays agrégée
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden />
      </button>

      <div className="flex flex-col gap-2">
        <p className="px-2 text-[11px] font-semibold text-gray-400">Pays</p>
        <div className="flex flex-wrap items-center gap-2">
          {ADMIN_COUNTRY_PILLS.map((code, i) => (
            <button
              key={code}
              type="button"
              className={cn(
                'flex h-8 items-center rounded-full px-3 text-[12px] font-semibold',
                i === 0 ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
              )}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-2 text-[11px] font-semibold text-gray-400">Navigation</p>
        <nav className="flex flex-col gap-1">
          {ADMIN_NAV.map((entry) => {
            const Icon = entry.icon;
            const isActive = entry.key === active;
            return (
              <Link
                key={entry.key}
                href={entry.href}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5',
                  isActive ? 'bg-brand/10' : 'hover:bg-gray-50',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] flex-shrink-0',
                      isActive ? 'text-brand' : 'text-gray-400',
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'truncate text-[14px]',
                      isActive ? 'font-semibold text-brand' : 'font-medium text-gray-700',
                    )}
                  >
                    {entry.label}
                  </span>
                </span>
                {entry.count != null && (
                  <span
                    className={cn(
                      'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                      isActive ? 'bg-white text-brand' : 'bg-gray-100 text-gray-700',
                    )}
                  >
                    {entry.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        className="flex items-center gap-2.5 rounded-lg bg-red-500 px-3 py-2.5 text-left text-[14px] font-semibold text-white"
      >
        <LogOut className="h-[18px] w-[18px] flex-shrink-0" aria-hidden />
        Déconnexion
      </button>
    </div>
  );
}
