'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, CreditCard, Loader2, LogOut, ShieldCheck, User } from 'lucide-react';
import { useAuth, type User as AuthUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { InitialsAvatar } from './InitialsAvatar';

/** "Kévin KOUSSOUGBE" → "Kévin"; falls back to the e-mail local part. */
export function firstNameOf(user: Pick<AuthUser, 'name' | 'email'>): string {
  const first = (user.name ?? '').trim().split(/\s+/)[0];
  return first || user.email.split('@')[0] || user.email;
}

/** Closes a popover on outside click or Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

// Below `sm` the panels span the viewport under the topbar (the trigger sits
// mid-bar on phones, so anchoring to it would push the panel off-screen).
const PANEL_BASE =
  'fixed inset-x-4 top-[68px] z-50 rounded-2xl border border-black/[0.06] bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2';

// ───────────────────────────────────────────────────────────────────────
// Notifications
// ───────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Where a notification leads, or `null` when it has no natural target. */
function notificationHref(n: NotificationItem): string | null {
  const data = n.data ?? {};
  const requestId = typeof data.requestId === 'string' ? data.requestId : null;
  switch (n.type) {
    case 'ALERT_MATCH':
    case 'REQUEST_REVIEW':
      return requestId ? `/demandes/${requestId}` : '/demandes';
    case 'LISTING_INQUIRY':
      return '/contacts';
    case 'PAYMENT_RECEIVED':
    case 'SUBSCRIPTION_REMINDER':
    case 'SUBSCRIPTION_GRACE':
    case 'SUBSCRIPTION_EXPIRED':
    case 'TRIAL_REMINDER':
    case 'TRIAL_ENDED':
      return '/settings?tab=abonnement';
    default:
      return null;
  }
}

export function NotificationBell({
  unreadCount,
  compact = false,
}: {
  unreadCount: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(unreadCount);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  // The shell refetches the count on its own; follow it when it changes.
  useEffect(() => setUnread(unreadCount), [unreadCount]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await api<{ items: NotificationItem[] }>('/api/notifications?limit=8');
      setItems(res.items);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(ids: string[] | 'all') {
    try {
      const res = await api<{ unreadCount: number }>('/api/notifications', {
        method: 'PATCH',
        body: { ids },
      });
      setUnread(res.unreadCount);
      const now = new Date().toISOString();
      setItems((prev) =>
        prev
          ? prev.map((n) =>
              ids === 'all' || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n,
            )
          : prev,
      );
    } catch {
      // best-effort — the next open refetches the real state
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={unread > 0 ? `Notifications (${unread} non lues)` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          'relative flex items-center justify-center rounded-lg bg-gray-50 text-neutral-700 hover:bg-gray-100',
          compact ? 'h-[34px] w-[34px]' : 'h-9 w-9',
        )}
      >
        <Bell className={compact ? 'h-[17px] w-[17px]' : 'h-[18px] w-[18px]'} aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-[9px] w-[9px] rounded-full border-2 border-white bg-red-500" />
        )}
      </button>

      {open && (
        <div className={cn(PANEL_BASE, 'sm:w-[380px]')} role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
            <p className="font-sora text-[14px] font-semibold text-neutral-900">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {loading && !items ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" aria-hidden />
              </div>
            ) : failed ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400">
                Impossible de charger les notifications.
              </p>
            ) : items && items.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400">
                Aucune notification pour le moment.
              </p>
            ) : (
              items?.map((n) => {
                const href = notificationHref(n);
                const isUnread = n.readAt === null;
                const content = (
                  <>
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                        isUnread ? 'bg-brand' : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px] text-neutral-900',
                          isUnread ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {n.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-gray-500">
                        {n.body}
                      </span>
                      <span className="mt-1 block text-[11px] text-gray-400">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </>
                );
                const className = cn(
                  'flex w-full items-start gap-3 border-b border-black/[0.04] px-4 py-3 text-left last:border-b-0 hover:bg-gray-50',
                  isUnread && 'bg-brand/[0.04]',
                );
                const onActivate = () => {
                  if (isUnread) void markRead([n.id]);
                };
                return href ? (
                  <Link
                    key={n.id}
                    href={href}
                    className={className}
                    onClick={() => {
                      onActivate();
                      close();
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button key={n.id} type="button" className={className} onClick={onActivate}>
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// User menu
// ───────────────────────────────────────────────────────────────────────

const MENU_LINKS = [
  { href: '/settings', label: 'Mon profil', Icon: User },
  { href: '/settings?tab=securite', label: 'Sécurité', Icon: ShieldCheck },
  { href: '/settings?tab=notifications', label: 'Notifications', Icon: Bell },
  { href: '/settings?tab=abonnement', label: 'Abonnement', Icon: CreditCard },
] as const;

export function UserMenu({ user, roleLabel }: { user: AuthUser; roleLabel: string }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu du compte"
        className="flex items-center gap-2 rounded-lg py-0.5 pr-1 pl-0.5 hover:bg-gray-50 lg:gap-2.5"
      >
        <InitialsAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size={32} />
        <span className="flex flex-col items-start gap-0.5">
          <span className="text-xs font-semibold whitespace-nowrap text-neutral-900 lg:text-[13px]">
            {firstNameOf(user)}
          </span>
          <span className="inline-block w-fit rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-semibold whitespace-nowrap text-brand lg:px-2 lg:text-[10px]">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className={cn(PANEL_BASE, 'py-1.5 sm:w-[240px]')} role="menu">
          <div className="border-b border-black/[0.06] px-4 pt-1.5 pb-3">
            <p className="truncate text-[13px] font-semibold text-neutral-900">
              {user.name ?? firstNameOf(user)}
            </p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
          <div className="py-1.5">
            {MENU_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={close}
                className="flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-gray-50"
              >
                <Icon className="h-[15px] w-[15px] text-gray-400" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
          <div className="border-t border-black/[0.06] pt-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void logout()}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-[15px] w-[15px]" aria-hidden />
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
