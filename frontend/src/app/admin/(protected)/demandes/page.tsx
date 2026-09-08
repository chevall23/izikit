'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Clock3,
  CheckCircle2,
  XCircle,
  Download,
  Plus,
  Check,
  Eye,
  Pencil,
  MoreHorizontal,
  Home,
  MapPin,
  Maximize2,
  DoorOpen,
  Sofa,
  Users,
  Sparkles,
  Archive,
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
import { DemandesFilterBar, EMPTY_FILTERS, filtersToQuery, type Filters } from './filter-bar';
import { DemandeEditForm } from './edit-form';
import { DemandeCreateForm } from './create-form';
import type { RequestDetail } from './types';
import {
  STATUS_LABEL,
  STATUS_TONE,
  PRIORITY_TONE,
  PROPERTY_LABEL,
  TXN_LABEL,
  labelOr,
} from './labels';

// ── API shapes (GET /api/admin/property-requests, /api/admin/property-requests/[id]) ─

type TabKey = 'all' | 'EN_ATTENTE' | 'EN_COURS' | 'CLOTUREE';

interface ListRow {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  country: string;
  city: string;
  propertyType: string;
  transactionType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  priority: string;
  status: string;
  createdAt: string;
  owner: { id: string; name: string | null } | null;
}

interface Counts {
  all: number;
  enAttente: number;
  enCours: number;
  cloturee: number;
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtInt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

function formatBudget(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmtInt(min)} – ${fmtInt(max)} FCFA`;
  if (min != null) return `≥ ${fmtInt(min)} FCFA`;
  if (max != null) return `≤ ${fmtInt(max)} FCFA`;
  return '—';
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function shortRef(id: string): string {
  return `DEM-${id.slice(-6).toUpperCase()}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ── Config ───────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'EN_ATTENTE', label: 'En attente' },
  { key: 'EN_COURS', label: 'Transmises' },
  { key: 'CLOTUREE', label: 'Archivées' },
];

const PER_PAGE = 20;
const EMPTY_COUNTS: Counts = { all: 0, enAttente: 0, enCours: 0, cloturee: 0 };

function countFor(counts: Counts, key: TabKey): number {
  if (key === 'all') return counts.all;
  if (key === 'EN_ATTENTE') return counts.enAttente;
  if (key === 'EN_COURS') return counts.enCours;
  return counts.cloturee;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDemandesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const pendingEdit = useRef(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const statusParam = tab === 'all' ? '' : `&status=${tab}`;
  const filterQs = useMemo(() => filtersToQuery(filters), [filters]);

  // CSV export honours the active tab + filter bar. Plain <a> — the route is
  // a same-origin GET (cookie auth, no CSRF) that replies with
  // Content-Disposition: attachment.
  const exportHref = useMemo(() => {
    const parts = [tab !== 'all' ? `status=${tab}` : '', filterQs.replace(/^&/, '')].filter(
      Boolean,
    );
    return `/api/admin/property-requests/export${parts.length ? `?${parts.join('&')}` : ''}`;
  }, [tab, filterQs]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${statusParam}${filterQs}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await api<{ items: ListRow[]; nextCursor: string | null; counts: Counts }>(
        `/api/admin/property-requests${qs}`,
      );
      setCounts(res.counts);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [statusParam, filterQs],
  );

  const total = countFor(counts, tab);
  // Any status-tab or filter change snaps back to page 1 and refetches counts.
  const pager = useCursorPager<ListRow>({
    perPage: PER_PAGE,
    total,
    fetchPage,
    resetKey: `${tab}|${filterQs}`,
  });

  useEffect(() => {
    if (pager.error) toast('Impossible de charger les demandes.', 'error');
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
    api<{ request: RequestDetail }>(`/api/admin/property-requests/${openId}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.request);
        if (pendingEdit.current) setEditing(true);
        pendingEdit.current = false;
      })
      .catch(() => {
        if (cancelled) return;
        toast('Impossible de charger le détail de la demande.', 'error');
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

  async function bulkAction(action: 'transmit' | 'archive') {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      const res = await api<{
        ok: string[];
        failed: string[];
        skipped: string[];
        notifiedAgents?: number;
      }>('/api/admin/property-requests/bulk', { method: 'POST', body: { action, ids } });
      const done = res.ok.length;
      const verb = action === 'transmit' ? 'transmise' : 'archivée';
      let msg = `${done} demande${done > 1 ? 's' : ''} ${verb}${done > 1 ? 's' : ''}.`;
      if (action === 'transmit' && res.notifiedAgents != null) {
        msg += ` ${res.notifiedAgents} notification${res.notifiedAgents > 1 ? 's' : ''} agent envoyée${
          res.notifiedAgents > 1 ? 's' : ''
        }.`;
      }
      if (res.failed.length)
        msg += ` ${res.failed.length} échec${res.failed.length > 1 ? 's' : ''}.`;
      toast(msg, res.failed.length ? 'error' : 'success');
      setSelected(new Set());
      pager.reload();
    } catch {
      toast("L'action groupée a échoué. Réessaie.", 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function mutate(
    patch: { status?: RequestDetail['status']; rematch?: boolean },
    successMsg: (notifiedAgents: number | null) => string,
  ) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const res = await api<{ request: RequestDetail; notifiedAgents?: number }>(
        `/api/admin/property-requests/${detail.id}`,
        { method: 'PATCH', body: patch },
      );
      setDetail(res.request);
      toast(successMsg(res.notifiedAgents ?? null), 'success');
      pager.reload();
    } catch {
      toast("L'action a échoué. Réessaie.", 'error');
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
        { icon: Home, label: labelOr(PROPERTY_LABEL, detail.propertyType) },
        {
          icon: MapPin,
          label: detail.landmark ? `${detail.landmark}, ${detail.city}` : detail.city,
        },
        ...(detail.surfaceM2 != null ? [{ icon: Maximize2, label: `${detail.surfaceM2} m²` }] : []),
        ...(detail.bedrooms ? [{ icon: DoorOpen, label: detail.bedrooms }] : []),
        ...(detail.salons ? [{ icon: Sofa, label: detail.salons }] : []),
        ...(detail.capacity != null ? [{ icon: Users, label: `${detail.capacity} places` }] : []),
        ...detail.amenities.map((a) => ({ icon: Sparkles, label: a })),
      ]
    : [];

  return (
    <AdminShell
      active="demande"
      searchPlaceholder="Rechercher une demande, un demandeur, un agent…"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Administration · Privé</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Demandes immobilières
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Suivi et traitement de toutes les demandes déposées par les utilisateurs. Accès
            restreint à l&apos;équipe admin.
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
            onClick={() => {
              setOpenId(null);
              setCreating(true);
            }}
            className="flex h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nouvelle demande
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard
          icon={<FileText className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Cumul"
          deltaTone="neutral"
          value={String(counts.all)}
          label="Demandes totales"
          footLeft="Tous statuts confondus"
          footRight=""
        />
        <AdminKpiCard
          icon={<Clock3 className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="À traiter"
          deltaTone="warn"
          value={String(counts.enAttente)}
          label="En attente de traitement"
          footLeft="En file d'attente"
          footRight=""
        />
        <AdminKpiCard
          icon={<CheckCircle2 className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="En cours"
          deltaTone="up"
          value={String(counts.enCours)}
          label="Traitées / Transmises"
          footLeft="Agents notifiés"
          footRight=""
        />
        <AdminKpiCard
          icon={<XCircle className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Terminées"
          deltaTone="neutral"
          value={String(counts.cloturee)}
          label="Archivées / Clôturées"
          footLeft="Demandes terminées"
          footRight=""
        />
      </section>

      {/* Filter bar */}
      <DemandesFilterBar value={filters} onChange={setFilters} />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            itemLabel="demande"
            actions={
              <>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkAction('transmit')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Transmettre en masse
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => bulkAction('archive')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 disabled:opacity-50"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden />
                  Archiver en masse
                </button>
              </>
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="font-sora text-[15px] font-bold text-neutral-900">
              Liste des demandes
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
              {total} demande{total > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
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
                  'Demandeur',
                  'Pays / Ville',
                  'Type de bien',
                  'Budget',
                  'Statut',
                  'Date de dépôt',
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
                  <td colSpan={8} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune demande dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
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
                        aria-label={`Sélectionner — ${r.clientName}`}
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
                          {initials(r.clientName)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {r.clientName}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">
                            Réf. {shortRef(r.id)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {r.city}, {r.country}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {labelOr(PROPERTY_LABEL, r.propertyType)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                      {formatBudget(r.budgetMin, r.budgetMax)}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                        {labelOr(STATUS_LABEL, r.status)}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${r.clientName}`}
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
                          aria-label={`Modifier — ${r.clientName}`}
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
                          aria-label={`Actions — ${r.clientName}`}
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
          itemLabel="demandes"
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

      {/* Detail / create drawer */}
      <AdminDrawer
        open={openId != null || creating}
        onClose={() => {
          setOpenId(null);
          setCreating(false);
        }}
        title={
          creating
            ? 'Nouvelle demande'
            : detail
              ? `Demande de ${labelOr(PROPERTY_LABEL, detail.propertyType).toLowerCase()} à ${detail.city}`
              : 'Détail de la demande'
        }
        titleExtra={
          detail &&
          !creating && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {shortRef(detail.id)} · Privé admin
            </span>
          )
        }
        footer={
          !creating && detail && !editing ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  mutate({ status: 'EN_COURS', rematch: true }, (n) =>
                    n && n > 0
                      ? `Demande transmise — ${n} agent${n > 1 ? 's' : ''} notifié${n > 1 ? 's' : ''}.`
                      : 'Demande transmise — aucun nouvel agent à notifier pour l’instant.',
                  )
                }
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-emerald-50 text-[14px] font-semibold text-emerald-600 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Transmettre à un agent
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Modifier la demande
              </button>
              <button
                type="button"
                disabled={busy || detail.status === 'CLOTUREE'}
                onClick={() => mutate({ status: 'CLOTUREE' }, () => 'Demande archivée / clôturée.')}
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archiver / Clôturer
              </button>
            </>
          ) : undefined
        }
      >
        {creating ? (
          <DemandeCreateForm
            onCancel={() => setCreating(false)}
            onCreated={(n) => {
              setCreating(false);
              toast(
                n > 0
                  ? `Demande créée — ${n} agent${n > 1 ? 's' : ''} notifié${n > 1 ? 's' : ''}.`
                  : 'Demande créée.',
                'success',
              );
              pager.reload();
            }}
          />
        ) : detailLoading || !detail ? (
          <p className="py-10 text-center text-[13px] text-gray-400">Chargement…</p>
        ) : editing ? (
          <DemandeEditForm
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
                {initials(detail.clientName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-neutral-900">
                  {detail.clientName}
                </div>
                <div className="truncate text-[12px] text-gray-400">
                  {detail.clientPhone}
                  {detail.clientEmail ? ` · ${detail.clientEmail}` : ''}
                </div>
              </div>
              <AdminStatusBadge tone={STATUS_TONE[detail.status] ?? 'neutral'}>
                {labelOr(STATUS_LABEL, detail.status)}
              </AdminStatusBadge>
            </div>

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Critères de recherche</p>
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
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Détails financiers</p>
              <div className="flex flex-col gap-2.5">
                <DrawerRow
                  k="Budget minimum"
                  v={detail.budgetMin != null ? `${fmtInt(detail.budgetMin)} FCFA` : '—'}
                />
                <DrawerRow
                  k="Budget maximum"
                  v={detail.budgetMax != null ? `${fmtInt(detail.budgetMax)} FCFA` : '—'}
                />
                <DrawerRow k="Transaction" v={labelOr(TXN_LABEL, detail.transactionType)} />
                <DrawerRow k="Financement" v={detail.financing} />
                <DrawerRow k="Délai" v={detail.delay} />
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Informations admin</p>
              <div className="flex flex-col gap-2.5">
                <DrawerRow k="Date de dépôt" v={formatDate(detail.createdAt)} />
                <DrawerRow k="Pays cible" v={detail.country} />
                <DrawerRow k="Type de demandeur" v={detail.clientType} />
                <DrawerRow
                  k="Agent assigné"
                  v={detail.assignedAgent?.name ?? detail.assignedAgent?.email ?? 'Non assigné'}
                />
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-gray-400">Priorité</span>
                  <AdminStatusBadge tone={PRIORITY_TONE[detail.priority] ?? 'neutral'}>
                    {detail.priority}
                  </AdminStatusBadge>
                </div>
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-neutral-900">
              <strong className="font-bold">Note du demandeur :</strong>{' '}
              {detail.notes?.trim() ? detail.notes : 'Aucune note fournie.'}
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
