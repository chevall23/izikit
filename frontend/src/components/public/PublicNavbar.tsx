'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LayoutDashboard, LogOut, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { InitialsAvatar } from '@/components/dashboard/InitialsAvatar';
import { Logo } from '@/components/Logo';
import { PublicMobileDrawer } from './PublicMobileDrawer';

export type PublicNavKey = 'accueil' | 'annonces' | 'agents' | 'demande' | 'blog' | 'contact';

export const NAV_LINKS: { key: PublicNavKey; label: string; href: string | null }[] = [
  { key: 'accueil', label: 'Accueil', href: '/' },
  { key: 'annonces', label: 'Annonces immobilières', href: '/annonces' },
  { key: 'demande', label: 'Demandes immobilières', href: '/demande-immobiliere' },
  { key: 'agents', label: 'Agents immobiliers', href: '/agents' },
  { key: 'contact', label: 'Contact', href: '/contact' },
];

function InertNavLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span title="Bientôt disponible" className={cn('cursor-not-allowed select-none', className)}>
      {children}
    </span>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open]);

  if (!user) {
    return (
      <Link href="/login" className="hidden text-sm font-medium text-brand lg:inline">
        Connexion
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative hidden lg:block">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2">
        <InitialsAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size={30} />
        <span className="max-w-[140px] truncate text-sm font-medium text-neutral-900">
          {user.name ?? user.email}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+10px)] right-0 z-50 w-56 rounded-xl border border-black/[0.08] bg-white p-2 shadow-lg">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Tableau de bord
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

export function PublicNavbar({ active }: { active: PublicNavKey }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="border-b border-black/[0.06]">
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-6 px-4 lg:px-7">
        <Link href="/" className="flex items-center">
          <Logo height={34} />
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) =>
            link.href ? (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  'text-sm whitespace-nowrap',
                  active === link.key ? 'font-semibold text-brand' : 'font-medium text-gray-500',
                )}
              >
                {link.label}
              </Link>
            ) : (
              <InertNavLink
                key={link.key}
                className={cn(
                  'text-sm whitespace-nowrap',
                  active === link.key ? 'font-semibold text-brand' : 'font-medium text-gray-500',
                )}
              >
                {link.label}
              </InertNavLink>
            ),
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <AccountMenu />
          <Link
            href="/listings/new"
            className="hidden rounded-full bg-brand px-[18px] py-[11px] text-sm font-semibold text-white lg:inline-flex"
          >
            Publier une annonce
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-neutral-900 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <PublicMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={active} />
    </div>
  );
}
