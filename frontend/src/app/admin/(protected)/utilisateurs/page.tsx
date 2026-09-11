'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Users,
  UserRoundPlus,
  ShieldQuestion,
  Ban,
  Check,
  Eye,
  MoreHorizontal,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  FileText,
  TrendingUp,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminBulkBar } from '@/components/admin/AdminBulkBar';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCursorPager } from './use-cursor-pager';
import { UtilisateursFilterBar, EMPTY_FILTERS, filtersToQuery, type Filters } from './filter-bar';
import {
  TYPE_LABEL,
  TYPE_TONE,
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_TONE,
  LEGAL_DOCUMENT_TYPE_LABEL,
  labelOr,
} from './labels';

// ── API shapes (GET /api/admin/users, /api/admin/users/[id]) ───────────────

type TabKey = 'all' | 'PARTICULIER' | 'AGENCE' | 'DEMARCHEUR';

interface ListRow {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  role: string;
  status: string;
  type: 'PARTICULIER' | 'AGENCE' | 'DEMARCHEUR';
  displayStatus: 'ACTIF' | 'EN_VERIFICATION' | 'SUSPENDU';
  annonces: number;
  jetons: number;
  verifiedDocCount: number;
  verifiedDocTotal: number;
  createdAt: string;
}

interface Counts {
  all: number;
  particulier: number;
  agence: number;
  demarcheur: number;
}

interface Stats {
  total: number;
  newLast7d: number;
  pendingVerification: number;
}

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  role: string;
  status: string;
  type: 'PARTICULIER' | 'AGENCE' | 'DEMARCHEUR';
  displayStatus: 'ACTIF' | 'EN_VERIFICATION' | 'SUSPENDU';
  createdAt: string;
  jetons: number;
  organization: { id: string; name: string } | null;
  kyc: {
    verified: boolean;
    verifiedDocCount: number;
    verifiedDocTotal: number;
    documents: { id: string; type: string; status: string; url: string; createdAt: string }[];
  } | null;
  rating: number | null;
  conversionRate: number | null;
  listings: {
    id: string;
    title: string;
    city: string;
    price: number;
    currency: string;
    transactionType: string;
    status: string;
    thumbnailUrl: string | null;
  }[];
  listingCount: number;
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatPrice(price: number, currency: string): string {
  const n = new Intl.NumberFormat('fr-FR').format(price);
  return currency === 'XOF' ? `${n} FCFA` : `${n} ${currency}`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function initials(name: string | null, fallback: string): string {
  const src = (name ?? fallback).trim();
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ── Config ───────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'PARTICULIER', label: 'Particuliers' },
  { key: 'AGENCE', label: 'Agences' },
  { key: 'DEMARCHEUR', label: 'Démarcheurs' },
];

const PER_PAGE = 25;
const EMPTY_COUNTS: Counts = { all: 0, particulier: 0, agence: 0, demarcheur: 0 };
const EMPTY_STATS: Stats = { total: 0, newLast7d: 0, pendingVerification: 0 };

function countFor(counts: Counts, key: TabKey): number {
  if (key === 'all') return counts.all;
  if (key === 'PARTICULIER') return counts.particulier;
  if (key === 'AGENCE') return counts.agence;
  return counts.demarcheur;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUtilisateursPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const typeParam = tab === 'all' ? '' : `&type=${tab}`;
  const filterQs = useMemo(() => filtersToQuery(filters), [filters]);

  // CSV export honours the active tab + filter bar. Plain <a> — the route is
  // a same-origin GET (cookie auth, no CSRF) that replies with
  // Content-Disposition: attachment.
  const exportHref = useMemo(() => {
    const parts = [tab !== 'all' ? `type=${tab}` : '', filterQs.replace(/^&/, '')].filter(Boolean);
    return `/api/admin/users/export${parts.length ? `?${parts.join('&')}` : ''}`;
  }, [tab, filterQs]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${typeParam}${filterQs}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await api<{
        items: ListRow[];
        nextCursor: string | null;
        counts: Counts;
        stats: Stats;
      }>(`/api/admin/users${qs}`);
      setCounts(res.counts);
      setStats(res.stats);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [typeParam, filterQs],
  );

  const total = countFor(counts, tab);
  const pager = useCursorPager<ListRow>({
    perPage: PER_PAGE,
    total,
    fetchPage,
    resetKey: `${tab}|${filterQs}`,
  });

  useEffect(() => {
    if (pager.error) toast('Impossible de charger les utilisateurs.', 'error');
  }, [pager.error, toast]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    api<{ user: UserDetail }>(`/api/admin/users/${openId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.user);
      })
      .catch(() => {
        if (cancelled) return;
        toast("Impossible de charger le détail de l'utilisateur.", 'error');
        setOpenId(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, toast]);

  function switchTab(key: TabKey) {
    setTab(key);
    setSelected(new Set());
    setOpenId(null);
  }

  // Drop the selection whenever the visible set changes (tab or filters).
  useEffect(() => {
    setSelected(new Set());
  }, [tab, filterQs]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSuspend() {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      const res = await api<{ ok: string[]; skipped: { id: string; reason: string }[] }>(
        '/api/admin/users/bulk',
        { method: 'POST', body: { action: 'suspend', ids } },
      );
      const done = res.ok.length;
      let msg = `${done} compte${done > 1 ? 's' : ''} suspendu${done > 1 ? 's' : ''}.`;
      if (res.skipped.length)
        msg += ` ${res.skipped.length} ignoré${res.skipped.length > 1 ? 's' : ''}.`;
      toast(msg, res.skipped.length ? 'error' : 'success');
      setSelected(new Set());
      pager.reload();
    } catch {
      toast("L'action groupée a échoué. Réessaie.", 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleSuspend() {
    if (!detail || busy) return;
    setBusy(true);
    const nextStatus = detail.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      const res = await api<{ user: { id: string; status: string } }>(
        `/api/admin/users/${detail.id}/status`,
        { method: 'PATCH', body: { status: nextStatus } },
      );
      setDetail({ ...detail, status: res.user.status });
      toast(nextStatus === 'SUSPENDED' ? 'Compte suspendu.' : 'Compte réactivé.', 'success');
      pager.reload();
    } catch {
      toast("L'action a échoué. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  const rows = pager.items;

  return (
    <AdminShell active="users" searchPlaceholder="Rechercher un utilisateur, annonce, paiement…">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">
            Administration · Multi-pays agrégée
          </p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Utilisateurs
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Gestion des comptes, vérifications KYC, activité et transactions de tous les profils
            inscrits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={exportHref}
            download
            className="flex h-[38px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter CSV
          </a>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <AdminKpiCard
          icon={<Users className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Cumul"
          deltaTone="neutral"
          value={stats.total.toLocaleString('fr-FR')}
          label="Total utilisateurs"
          footLeft="Agences, particuliers, démarcheurs, admins"
          footRight=""
        />
        <AdminKpiCard
          icon={<UserRoundPlus className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="7 derniers jours"
          deltaTone="up"
          value={stats.newLast7d.toLocaleString('fr-FR')}
          label="Nouvelles inscriptions · 7j"
          footLeft="Comparé aux 7 jours précédents"
          footRight=""
        />
        <AdminKpiCard
          icon={<ShieldQuestion className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
          delta="À traiter"
          deltaTone="warn"
          value={stats.pendingVerification.toLocaleString('fr-FR')}
          label="Comptes en attente de vérification"
          footLeft="KYC et documents en cours de traitement"
          footRight=""
        />
      </section>

      {/* Filter bar */}
      <UtilisateursFilterBar value={filters} onChange={setFilters} />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-col gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-sora text-[15px] font-bold text-neutral-900">
              Tous les utilisateurs
            </span>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-brand">
              {total.toLocaleString('fr-FR')} au total
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={cn(
                  'flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                  tab === t.key ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                    tab === t.key ? 'bg-brand text-white' : 'bg-black/[0.07] text-gray-700',
                  )}
                >
                  {countFor(counts, t.key).toLocaleString('fr-FR')}
                </span>
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            actions={
              <>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={bulkSuspend}
                  className="flex h-[30px] items-center gap-1.5 rounded-lg bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Suspendre
                </button>
                <a
                  href={`/api/admin/users/export?ids=${[...selected].join(',')}`}
                  download
                  className="flex h-[30px] items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Exporter CSV
                </a>
              </>
            }
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {[
                  '',
                  'Utilisateur',
                  'Type',
                  'Pays',
                  'Statut',
                  'Annonces',
                  'Jetons',
                  'Inscription',
                  '',
                ].map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.loading ? (
                <tr>
                  <td colSpan={9} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucun utilisateur dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((u, i) => (
                  <tr
                    key={u.id}
                    onClick={() => setOpenId(u.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      selected.has(u.id) ? 'bg-brand/5' : i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Sélectionner ${u.name ?? u.email}`}
                        aria-pressed={selected.has(u.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelected(u.id);
                        }}
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-[4px] border-2',
                          selected.has(u.id)
                            ? 'border-brand bg-brand'
                            : 'border-black/[0.15] bg-white',
                        )}
                      >
                        {selected.has(u.id) && (
                          <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">
                            {initials(u.name, u.email)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {u.name ?? u.email}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={TYPE_TONE[u.type] ?? 'neutral'}>
                        {labelOr(TYPE_LABEL, u.type)}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {u.country ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={DISPLAY_STATUS_TONE[u.displayStatus] ?? 'neutral'}>
                        {labelOr(DISPLAY_STATUS_LABEL, u.displayStatus)}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
                      {u.annonces}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
                      {u.jetons}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${u.name ?? u.email}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(u.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Eye className="h-3.5 w-3.5 text-brand" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions — ${u.name ?? u.email}`}
                          title="Bientôt disponible"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 opacity-60"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          from={pager.from}
          to={pager.to}
          total={total}
          itemLabel="utilisateurs"
          perPage={PER_PAGE}
          pages={pager.pageNumbers}
          activePage={pager.page}
          onPrev={pager.goPrev}
          onNext={pager.goNext}
          onPage={pager.goPage}
          disabledPrev={pager.loading || pager.page <= 1}
          disabledNext={pager.loading || pager.page >= pager.pageCount}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={openId != null}
        onClose={() => setOpenId(null)}
        header={
          detail && (
            <div className="flex min-w-0 items-center gap-3.5">
              {detail.avatarUrl ? (
                <img
                  src={detail.avatarUrl}
                  alt=""
                  className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[16px] font-bold text-brand">
                  {initials(detail.name, detail.email)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-sora text-[17px] font-bold text-neutral-900">
                  {detail.name ?? detail.email}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <AdminStatusBadge tone={TYPE_TONE[detail.type] ?? 'neutral'}>
                    {labelOr(TYPE_LABEL, detail.type)}
                  </AdminStatusBadge>
                  <AdminStatusBadge tone={DISPLAY_STATUS_TONE[detail.displayStatus] ?? 'neutral'}>
                    {labelOr(DISPLAY_STATUS_LABEL, detail.displayStatus)}
                  </AdminStatusBadge>
                  {detail.kyc?.verified && (
                    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-100 px-2.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      Vérifié KYC
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        }
        footer={
          detail && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={toggleSuspend}
                className={cn(
                  'flex h-[38px] items-center justify-center gap-2 rounded-lg text-[14px] font-semibold disabled:opacity-50',
                  detail.status === 'SUSPENDED'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-500',
                )}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                {detail.status === 'SUSPENDED' ? 'Réactiver le compte' : 'Suspendre le compte'}
              </button>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled
                  title="Bientôt disponible"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg border border-brand text-[14px] font-semibold text-brand opacity-50"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  Envoyer un message
                </button>
                <button
                  type="button"
                  disabled
                  title="Bientôt disponible"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900 opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Modifier le profil
                </button>
              </div>
            </>
          )
        }
      >
        {detailLoading || !detail ? (
          <p className="py-10 text-center text-[13px] text-gray-400">Chargement…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <StatItem value={String(detail.listingCount)} label="Annonces actives" />
              <StatItem value={String(detail.jetons)} label="Jetons restants" />
              <StatItem
                value={detail.rating != null ? `${detail.rating.toFixed(1)} ★` : '—'}
                label="Note moyenne"
              />
            </div>

            <div>
              <p className="mb-3 text-[13px] font-bold text-neutral-900">Informations de contact</p>
              <div className="flex flex-col gap-3">
                <ContactRow
                  icon={<Mail className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Email"
                  value={detail.email}
                />
                <ContactRow
                  icon={<Phone className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Téléphone"
                  value={detail.phone ?? '—'}
                />
                <ContactRow
                  icon={<MapPin className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Pays / Ville"
                  value={[detail.city, detail.country].filter(Boolean).join(', ') || '—'}
                />
                <ContactRow
                  icon={<Calendar className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Date d'inscription"
                  value={formatDate(detail.createdAt)}
                />
              </div>
            </div>

            {detail.kyc && (
              <div
                className={cn(
                  'rounded-lg border p-3.5',
                  detail.kyc.verified
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50',
                )}
              >
                <div
                  className={cn(
                    'mb-1.5 flex items-center gap-2 text-[13px] font-bold',
                    detail.kyc.verified ? 'text-emerald-800' : 'text-amber-800',
                  )}
                >
                  <ShieldCheck className="h-[15px] w-[15px]" aria-hidden />
                  {detail.kyc.verified
                    ? `Documents KYC — ${labelOr(TYPE_LABEL, detail.type)} vérifiée`
                    : `Documents KYC — ${detail.kyc.verifiedDocCount}/${detail.kyc.verifiedDocTotal} vérifiés`}
                </div>
                <div className="flex flex-col gap-2">
                  {detail.kyc.documents.length === 0 ? (
                    <p className="text-[12px] text-amber-700">
                      Aucun document soumis pour l&apos;instant.
                    </p>
                  ) : (
                    detail.kyc.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2.5 rounded-md bg-white px-3 py-2"
                      >
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden />
                        <span className="flex-1 truncate text-[13px] text-neutral-900">
                          {labelOr(LEGAL_DOCUMENT_TYPE_LABEL, doc.type)}
                          {doc.status !== 'VERIFIED' && (
                            <span className="ml-1.5 text-[11px] text-gray-400">
                              ({doc.status === 'PENDING' ? 'en attente' : 'rejeté'})
                            </span>
                          )}
                        </span>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 text-[12px] font-semibold whitespace-nowrap text-brand"
                        >
                          Voir
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Annonces récentes ({detail.listingCount})
              </p>
              <div className="flex flex-col gap-2.5">
                {detail.listings.length === 0 ? (
                  <p className="text-[13px] text-gray-400">
                    Aucune annonce publiée pour l&apos;instant.
                  </p>
                ) : (
                  detail.listings.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2.5 rounded-lg border border-black/[0.08] p-2.5"
                    >
                      {l.thumbnailUrl ? (
                        <img
                          src={l.thumbnailUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 flex-shrink-0 rounded-md bg-gray-100" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">
                          {l.title}
                        </div>
                        <div className="truncate text-[12px] text-gray-400">
                          {formatPrice(l.price, l.currency)} · {l.city}
                        </div>
                      </div>
                      <AdminStatusBadge tone={l.status === 'VERIFIED' ? 'success' : 'warning'}>
                        {l.status === 'VERIFIED' ? 'Validée' : 'En attente'}
                      </AdminStatusBadge>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-lg bg-gray-50 p-3.5">
              <TrendingUp className="h-5 w-5 flex-shrink-0 text-brand" aria-hidden />
              <div>
                <div className="text-[13px] font-bold text-neutral-900">
                  Taux de conversion :{' '}
                  {detail.conversionRate != null ? `${detail.conversionRate.toFixed(1)}%` : '—'}
                </div>
                <div className="text-[12px] text-gray-400">
                  Annonces → visites confirmées (30 derniers jours)
                </div>
              </div>
            </div>
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center">
      <div className="text-[20px] leading-none font-bold text-neutral-900">{value}</div>
      <div className="mt-1 text-[11px] text-gray-400">{label}</div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="text-[13px] font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
