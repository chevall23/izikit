'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Siren,
  Zap,
  BellRing,
  PauseCircle,
  PlayCircle,
  Download,
  Plus,
  Check,
  Eye,
  Pencil,
  MoreHorizontal,
  Home,
  MapPin,
  Banknote,
  ShoppingBag,
  Activity,
  Send,
  Trash2,
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
import { AlerteFilterBar, EMPTY_FILTERS, filtersToQuery, type Filters } from './filter-bar';
import { AlerteEditForm } from './edit-form';
import type { AlertDetail } from './types';
import {
  ACTIVE_LABEL,
  ACTIVE_TONE,
  PROPERTY_LABEL,
  TXN_LABEL,
  FREQUENCY_LABEL,
  REQUEST_STATUS_LABEL,
  labelOr,
} from './labels';

// ── API shapes ───────────────────────────────────────────────────────────────

type TabKey = 'all' | 'active' | 'inactive';

interface ListRow {
  id: string;
  name: string;
  transactionType: string;
  propertyTypes: string[];
  country: string;
  cities: string[];
  priceMin: number | null;
  priceMax: number | null;
  frequency: string;
  notifWhatsapp: boolean;
  notifEmail: boolean;
  notifSms: boolean;
  active: boolean;
  createdAt: string;
  matchCount: number;
  owner: { id: string; name: string | null } | null;
}

interface Counts {
  all: number;
  active: number;
  inactive: number;
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtInt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

function formatPrice(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmtInt(min)} – ${fmtInt(max)} FCFA`;
  if (min != null) return `≥ ${fmtInt(min)} FCFA`;
  if (max != null) return `≤ ${fmtInt(max)} FCFA`;
  return 'Tous budgets';
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function shortRef(id: string): string {
  return `ALS-${id.slice(-6).toUpperCase()}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}
function citiesLabel(cities: string[], country: string): string {
  if (cities.length === 0) return country;
  if (cities.length <= 2) return `${cities.join(', ')} · ${country}`;
  return `${cities.slice(0, 2).join(', ')} +${cities.length - 2} · ${country}`;
}
function propertyLabel(types: string[]): string {
  if (types.length === 0) return '—';
  if (types.length === 1) return labelOr(PROPERTY_LABEL, types[0]!);
  return `${labelOr(PROPERTY_LABEL, types[0]!)} +${types.length - 1}`;
}

// ── Config ───────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'active', label: 'Actives' },
  { key: 'inactive', label: 'En pause' },
];

const PER_PAGE = 20;
const EMPTY_COUNTS: Counts = { all: 0, active: 0, inactive: 0 };

function countFor(counts: Counts, key: TabKey): number {
  if (key === 'all') return counts.all;
  if (key === 'active') return counts.active;
  return counts.inactive;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAlerteSecteurPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const pendingEdit = useRef(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const statusParam = tab === 'all' ? '' : `&active=${tab === 'active' ? 'true' : 'false'}`;
  const filterQs = useMemo(() => filtersToQuery(filters), [filters]);

  // CSV export honours the active tab + filter bar. Plain <a> — same-origin
  // GET (cookie auth, no CSRF) replying with Content-Disposition: attachment.
  const exportHref = useMemo(() => {
    const activeParam = tab === 'all' ? '' : `active=${tab === 'active' ? 'true' : 'false'}`;
    const parts = [activeParam, filterQs.replace(/^&/, '')].filter(Boolean);
    return `/api/admin/alerts/export${parts.length ? `?${parts.join('&')}` : ''}`;
  }, [tab, filterQs]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${statusParam}${filterQs}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await api<{ items: ListRow[]; nextCursor: string | null; counts: Counts }>(
        `/api/admin/alerts${qs}`,
      );
      setCounts(res.counts);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [statusParam, filterQs],
  );

  const total = countFor(counts, tab);
  const pager = useCursorPager<ListRow>({
    perPage: PER_PAGE,
    total,
    fetchPage,
    resetKey: `${tab}|${filterQs}`,
  });

  useEffect(() => {
    if (pager.error) toast('Impossible de charger les alertes.', 'error');
  }, [pager.error, toast]);

  useEffect(() => {
    setEditing(false);
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    api<{ alert: AlertDetail }>(`/api/admin/alerts/${openId}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.alert);
        if (pendingEdit.current) setEditing(true);
        pendingEdit.current = false;
      })
      .catch(() => {
        if (cancelled) return;
        toast("Impossible de charger le détail de l'alerte.", 'error');
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
    setOpenId(null);
    setSelected(new Set());
  }

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

  async function bulkAction(action: 'activate' | 'deactivate' | 'delete') {
    if (selected.size === 0 || bulkBusy) return;
    if (action === 'delete') {
      const n = selected.size;
      if (!window.confirm(`Supprimer définitivement ${n} alerte${n > 1 ? 's' : ''} ?`)) return;
    }
    setBulkBusy(true);
    try {
      const ids = [...selected];
      const res = await api<{ ok: string[]; failed: string[]; skipped: string[] }>(
        '/api/admin/alerts/bulk',
        { method: 'POST', body: { action, ids } },
      );
      const done = res.ok.length;
      const verb =
        action === 'activate' ? 'activée' : action === 'deactivate' ? 'mise en pause' : 'supprimée';
      let msg = `${done} alerte${done > 1 ? 's' : ''} ${verb}${done > 1 ? 's' : ''}.`;
      if (res.failed.length)
        msg += ` ${res.failed.length} échec${res.failed.length > 1 ? 's' : ''}.`;
      toast(msg, res.failed.length ? 'error' : 'success');
      setSelected(new Set());
      if (action === 'delete') setOpenId(null);
      pager.reload();
    } catch {
      toast("L'action groupée a échoué. Réessaie.", 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function mutate(
    patch: { active?: boolean; rematch?: boolean },
    successMsg: (notifiedRequests: number | null) => string,
  ) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const res = await api<{ alert: AlertDetail; notifiedRequests?: number }>(
        `/api/admin/alerts/${detail.id}`,
        { method: 'PATCH', body: patch },
      );
      setDetail(res.alert);
      toast(successMsg(res.notifiedRequests ?? null), 'success');
      pager.reload();
    } catch {
      toast("L'action a échoué. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeAlert() {
    if (!detail || busy) return;
    if (!window.confirm(`Supprimer définitivement l'alerte « ${detail.name} » ?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/alerts/${detail.id}`, { method: 'DELETE' });
      toast('Alerte supprimée.', 'success');
      setOpenId(null);
      pager.reload();
    } catch {
      toast('La suppression a échoué. Réessaie.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const rows = pager.items;
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  const criteriaTags = detail
    ? [
        { icon: Home, label: propertyLabel(detail.propertyTypes) },
        { icon: MapPin, label: citiesLabel(detail.cities, detail.country) },
        { icon: Banknote, label: formatPrice(detail.priceMin, detail.priceMax) },
        { icon: ShoppingBag, label: labelOr(TXN_LABEL, detail.transactionType) },
        { icon: Activity, label: labelOr(FREQUENCY_LABEL, detail.frequency) },
      ]
    : [];

  const channels = detail
    ? [
        detail.notifEmail ? 'Email' : null,
        detail.notifSms ? 'SMS' : null,
        detail.notifWhatsapp ? 'WhatsApp' : null,
      ]
        .filter(Boolean)
        .join(' + ') || 'Aucun'
    : '';

  return (
    <AdminShell
      active="alerte-secteur"
      searchPlaceholder="Rechercher une alerte, un utilisateur, un secteur…"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Administration · Alertes</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Alerte Secteur
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Toutes les alertes sectorielles créées par les agents. Correspondances en temps réel et
            notifications automatiques.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={exportHref}
            download
            className="flex h-[38px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </a>
          <button
            type="button"
            disabled
            title="Les alertes sont créées par les agents depuis leur espace."
            className="flex h-[38px] cursor-not-allowed items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nouvelle alerte
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard
          icon={<Siren className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Cumul"
          deltaTone="neutral"
          value={String(counts.all)}
          label="Alertes totales"
          footLeft="Tous agents confondus"
          footRight=""
        />
        <AdminKpiCard
          icon={<Zap className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="En surveillance"
          deltaTone="up"
          value={String(counts.active)}
          label="Alertes actives"
          footLeft="Notifications automatiques"
          footRight=""
        />
        <AdminKpiCard
          icon={<PauseCircle className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Suspendues"
          deltaTone="warn"
          value={String(counts.inactive)}
          label="Alertes en pause"
          footLeft="Aucune notification"
          footRight=""
        />
        <AdminKpiCard
          icon={<BellRing className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Correspondances"
          deltaTone="neutral"
          value={String(rows.reduce((s, r) => s + r.matchCount, 0))}
          label="Sur la page courante"
          footLeft="Demandes appariées"
          footRight=""
        />
      </section>

      {/* Filter bar */}
      <AlerteFilterBar value={filters} onChange={setFilters} />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            itemLabel="alerte"
            actions={
              <>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkAction('activate')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600 disabled:opacity-50"
                >
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  Activer en masse
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkAction('deactivate')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[12px] font-semibold whitespace-nowrap text-amber-600 disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                  Mettre en pause
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkAction('delete')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Supprimer en masse
                </button>
              </>
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="font-sora text-[15px] font-bold text-neutral-900">
              Liste des alertes
            </span>
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
                    {countFor(counts, t.key)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {total > 0 && (
            <span className="text-[12px] font-medium text-gray-400">
              {total} alerte{total > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    aria-label={allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    aria-pressed={allVisibleSelected}
                    disabled={rows.length === 0}
                    onClick={toggleAll}
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-[4px] border-2 disabled:opacity-30',
                      allVisibleSelected ? 'border-brand bg-brand' : 'border-black/[0.15] bg-white',
                    )}
                  >
                    {allVisibleSelected && <Check className="h-2.5 w-2.5 text-white" aria-hidden />}
                  </button>
                </th>
                {[
                  'Propriétaire',
                  'Pays / Villes',
                  'Type de bien',
                  'Fréquence',
                  'Corresp.',
                  'Statut',
                  'Créée le',
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
                    Aucune alerte dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const ownerName = r.owner?.name ?? 'Agent inconnu';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={cn(
                        'cursor-pointer border-t border-black/[0.05]',
                        selected.has(r.id) ? 'bg-brand/5' : i % 2 !== 0 ? 'bg-gray-50/60' : '',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          aria-label={`Sélectionner — ${r.name}`}
                          aria-pressed={selected.has(r.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelected(r.id);
                          }}
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-[4px] border-2',
                            selected.has(r.id)
                              ? 'border-brand bg-brand'
                              : 'border-black/[0.15] bg-white',
                          )}
                        >
                          {selected.has(r.id) && (
                            <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">
                            {initials(ownerName)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-neutral-900">
                              {ownerName}
                            </div>
                            <div className="truncate text-[11px] text-gray-400">
                              {r.name} · {shortRef(r.id)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                        {citiesLabel(r.cities, r.country)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                        {propertyLabel(r.propertyTypes)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                        {labelOr(FREQUENCY_LABEL, r.frequency)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex h-[24px] items-center whitespace-nowrap rounded-full bg-brand/10 px-2.5 text-[11px] font-bold text-brand">
                          {r.matchCount}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <AdminStatusBadge tone={ACTIVE_TONE[r.active ? 'true' : 'false']}>
                          {ACTIVE_LABEL[r.active ? 'true' : 'false']}
                        </AdminStatusBadge>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            aria-label={`Voir — ${r.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(r.id);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                          >
                            <Eye className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Modifier — ${r.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              pendingEdit.current = true;
                              setOpenId(r.id);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                          >
                            <Pencil className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Actions — ${r.name}`}
                            title="Bientôt disponible"
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 opacity-60"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          from={pager.from}
          to={pager.to}
          total={total}
          itemLabel="alertes"
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
        title={detail ? detail.name : "Détail de l'alerte"}
        titleExtra={
          detail &&
          !editing && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {shortRef(detail.id)} · {ACTIVE_LABEL[detail.active ? 'true' : 'false']}
            </span>
          )
        }
        footer={
          detail && !editing ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  mutate({ rematch: true }, (n) =>
                    n && n > 0
                      ? `Rediffusée — ${n} demande${n > 1 ? 's' : ''} appariée${n > 1 ? 's' : ''}.`
                      : 'Rediffusée — aucune nouvelle demande à apparier pour l’instant.',
                  )
                }
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Rediffuser les correspondances
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Modifier l&apos;alerte
              </button>
              {detail.active ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => mutate({ active: false }, () => 'Alerte mise en pause.')}
                  className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-amber-50 text-[14px] font-semibold text-amber-600 disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                  Mettre en pause
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => mutate({ active: true }, () => 'Alerte réactivée.')}
                  className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-emerald-50 text-[14px] font-semibold text-emerald-600 disabled:opacity-50"
                >
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  Réactiver
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={removeAlert}
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer l&apos;alerte
              </button>
            </>
          ) : undefined
        }
      >
        {detailLoading || !detail ? (
          <p className="py-10 text-center text-[13px] text-gray-400">Chargement…</p>
        ) : editing ? (
          <AlerteEditForm
            key={detail.id}
            detail={detail}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setDetail(updated);
              setEditing(false);
              pager.reload();
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[14px] font-bold text-brand">
                {initials(detail.owner?.name ?? 'Agent')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-neutral-900">
                  {detail.owner?.name ?? 'Agent inconnu'}
                </div>
                <div className="truncate text-[12px] text-gray-400">
                  {detail.owner?.phone ? `${detail.owner.phone} · ` : ''}
                  {detail.owner?.email ?? '—'}
                </div>
              </div>
              <AdminStatusBadge tone={ACTIVE_TONE[detail.active ? 'true' : 'false']}>
                {ACTIVE_LABEL[detail.active ? 'true' : 'false']}
              </AdminStatusBadge>
            </div>

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Critères de l&apos;alerte
              </p>
              <div className="flex flex-wrap gap-2">
                {criteriaTags.map(({ icon: Icon, label }, idx) => (
                  <span
                    key={`${label}-${idx}`}
                    className="flex h-7 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 text-[12px] font-medium whitespace-nowrap text-neutral-900"
                  >
                    <Icon className="h-3 w-3 text-gray-400" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Paramètres de l&apos;alerte
              </p>
              <div className="flex flex-col gap-2.5">
                <DrawerRow k="Fréquence" v={labelOr(FREQUENCY_LABEL, detail.frequency)} />
                <DrawerRow k="Canaux de notification" v={channels} />
                <DrawerRow k="Pays cible" v={detail.country} />
                <DrawerRow
                  k="Villes"
                  v={detail.cities.length ? detail.cities.join(', ') : 'Tout le pays'}
                />
                <DrawerRow k="Créée le" v={formatDate(detail.createdAt)} />
                <DrawerRow k="Dernière modification" v={formatDate(detail.updatedAt)} />
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Dernières correspondances ({detail.matches.length})
              </p>
              {detail.matches.length === 0 ? (
                <p className="text-[13px] text-gray-400">
                  Aucune correspondance pour l&apos;instant.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {detail.matches.map((m) => {
                    const pr = m.propertyRequest;
                    if (!pr)
                      return (
                        <div
                          key={m.id}
                          className="rounded-lg border border-black/[0.08] p-2.5 text-[12px] text-gray-400"
                        >
                          Demande supprimée · {formatDate(m.createdAt)}
                        </div>
                      );
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2.5 rounded-lg border border-black/[0.08] p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {labelOr(PROPERTY_LABEL, pr.propertyType)} — {pr.city}, {pr.country}
                          </div>
                          <div className="truncate text-[12px] text-gray-400">
                            {pr.clientName} · {labelOr(TXN_LABEL, pr.transactionType)} ·{' '}
                            {formatDate(m.createdAt)}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className="text-[13px] font-bold whitespace-nowrap text-brand">
                            {formatPrice(pr.budgetMin, pr.budgetMax)}
                          </span>
                          <AdminStatusBadge tone="neutral">
                            {labelOr(REQUEST_STATUS_LABEL, pr.status)}
                          </AdminStatusBadge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function DrawerRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-400">{k}</span>
      <span className="font-semibold whitespace-nowrap text-neutral-900">{v}</span>
    </div>
  );
}
