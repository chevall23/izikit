'use client';

import { useState, type ReactNode } from 'react';
import { Search, Bell, ChevronsUpDown, Menu, X } from 'lucide-react';
import { AdminSidebarNav } from './AdminSidebarNav';
import type { AdminNavKey } from './admin-nav';

const DEFAULT_SEARCH_PLACEHOLDER =
  'Rechercher une annonce, un utilisateur, un paiement ou un ticket support';

/**
 * Admin back-office chrome from the Banani "Admin Dashboard" screen: a fixed
 * 248px sidebar + 76px topbar on `lg:` and up, collapsing to a hamburger-driven
 * slide-in drawer + compact topbar below. Mockup only — no auth wiring; the
 * admin identity is hard-coded from the design.
 */
export function AdminShell({
  active,
  searchPlaceholder = DEFAULT_SEARCH_PLACEHOLDER,
  children,
}: {
  active: AdminNavKey;
  searchPlaceholder?: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="hidden w-[248px] flex-shrink-0 border-r border-black/[0.08] p-4 pt-5 lg:block">
        <AdminSidebarNav active={active} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto bg-white p-4 pt-5 shadow-xl">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setDrawerOpen(false)}
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700"
            >
              <X className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <AdminSidebarNav active={active} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-[68px] items-center justify-between gap-3 border-b border-black/[0.08] px-4 lg:h-[76px] lg:gap-5 lg:px-7">
          <button
            type="button"
            aria-label="Ouvrir le menu"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 lg:hidden"
          >
            <Menu className="h-[18px] w-[18px]" aria-hidden />
          </button>

          <button
            type="button"
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-gray-100 px-3.5 text-left lg:w-[420px] lg:max-w-[420px] lg:flex-none"
          >
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden />
            <span className="truncate text-[14px] text-gray-400">{searchPlaceholder}</span>
          </button>

          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="relative flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-gray-100">
              <Bell className="h-[18px] w-[18px] text-neutral-900" aria-hidden />
              <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500" />
            </span>
            <button
              type="button"
              className="flex h-[42px] items-center gap-2.5 rounded-lg bg-gray-100 px-3"
            >
              <img
                src="https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F3"
                alt=""
                className="h-[30px] w-[30px] flex-shrink-0 rounded-full object-cover"
              />
              <span className="hidden min-w-0 flex-col gap-px sm:flex">
                <span className="text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                  Kofi Mensah
                </span>
                <span className="text-[11px] whitespace-nowrap text-gray-400">
                  Admin plateforme
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden />
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
