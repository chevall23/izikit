'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, LogOut, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { InitialsAvatar } from '@/components/dashboard/InitialsAvatar';
import { Logo } from '@/components/Logo';
import { NAV_LINKS, type PublicNavKey } from './PublicNavbar';

function DrawerLink({
  label,
  href,
  active,
  onNavigate,
}: {
  label: string;
  href: string | null;
  active: boolean;
  onNavigate: () => void;
}) {
  const className = cn(
    'mx-2 my-0.5 flex items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-[15px] font-medium',
    active
      ? 'bg-brand/10 text-brand'
      : href
        ? 'text-neutral-700 active:bg-gray-50'
        : 'text-gray-400',
  );
  if (!href) {
    return (
      <div className={className} aria-disabled="true" title="Bientôt disponible">
        {label}
        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
          Bientôt
        </span>
      </div>
    );
  }
  return (
    <Link href={href} className={className} onClick={onNavigate}>
      {label}
    </Link>
  );
}

export function PublicMobileDrawer({
  open,
  onClose,
  active,
}: {
  open: boolean;
  onClose: () => void;
  active: PublicNavKey;
}) {
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 lg:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        className={cn(
          'absolute inset-0 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          'absolute top-0 left-0 flex h-full w-[280px] max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[64px] flex-shrink-0 items-center justify-between border-b border-black/[0.06] px-4">
          <Link href="/" className="flex items-center" onClick={onClose}>
            <Logo height={26} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 active:bg-gray-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_LINKS.map((link) => (
            <DrawerLink
              key={link.key}
              label={link.label}
              href={link.href}
              active={active === link.key}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-black/[0.06] p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          {user ? (
            <>
              <div className="mb-1 flex items-center gap-2.5 px-1.5">
                <InitialsAvatar
                  name={user.name}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                  size={34}
                />
                <span className="truncate text-sm font-semibold text-neutral-900">
                  {user.name ?? user.email}
                </span>
              </div>
              <Link
                href="/dashboard"
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-full border border-black/[0.08] px-4 py-3 text-sm font-semibold text-neutral-700"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Tableau de bord
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout();
                }}
                className="flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-red-600"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Déconnexion
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="flex items-center justify-center rounded-full border border-black/[0.08] px-4 py-3 text-sm font-semibold text-brand"
            >
              Connexion
            </Link>
          )}
          <Link
            href="/listings/new"
            onClick={onClose}
            className="flex items-center justify-center rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white"
          >
            Publier une annonce
          </Link>
        </div>
      </aside>
    </div>
  );
}
