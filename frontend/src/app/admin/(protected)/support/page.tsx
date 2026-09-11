'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  Flag,
  MessageSquare,
  Clock,
  CheckCircle2,
  Timer,
  AlertOctagon,
  Ban,
  MoreHorizontal,
  Eye,
  X,
  UserX,
  Mail,
  Phone,
  Globe,
  Archive,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCursorPager } from './use-cursor-pager';
import { SignalementsFilterBar, EMPTY_FILTERS, filtersToQuery, type Filters } from './filter-bar';
import {
  REASON_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  CONTACT_SUBJECT_LABEL,
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_TONE,
  labelOr,
} from './labels';

// ── API shapes ───────────────────────────────────────────────────────────────

type Severity = 'CRITICAL' | 'MEDIUM' | 'LOW';

interface ReportRow {
  id: string;
  reason: string;
  severity: Severity;
  detail: string | null;
  status: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    status: string;
    city: string;
    country: string;
    price: number;
    currency: string;
    thumbnailUrl: string | null;
  };
}

interface HistoryEntry {
  id: string;
  kind: 'RECEIVED' | 'NOTE' | 'STATUS_CHANGE';
  actor: string | null;
  metadata: { note?: string; from?: string; to?: string } | null;
  createdAt: string;
}

interface ReportDetail {
  id: string;
  reason: string;
  severity: Severity;
  detail: string | null;
  status: string;
  createdAt: string;
  listing: ReportRow['listing'] & {
    owner: { id: string; name: string | null; email: string; phone: string | null } | null;
  };
}

interface Stats {
  pendingCount: number;
  resolvedThisWeek: number;
  avgProcessingTimeMs: number | null;
}

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  country: string | null;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatFcfa(n: number, currency: string): string {
  const s = new Intl.NumberFormat('fr-FR').format(n);
  return currency === 'XOF' ? `${s} FCFA` : `${s} ${currency}`;
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function historyText(h: HistoryEntry): string {
  if (h.kind === 'RECEIVED') return "Signalement reçu et en attente d'examen";
  if (h.kind === 'NOTE') return `Note interne : ${h.metadata?.note ?? ''}`;
  const from = labelOr(REPORT_STATUS_LABEL, h.metadata?.from ?? '');
  const to = labelOr(REPORT_STATUS_LABEL, h.metadata?.to ?? '');
  return `Statut changé : ${from} → ${to}`;
}

const PER_PAGE = 20;
const TAB_SIGNALEMENTS = 'signalements';
const TAB_SUPPORT = 'support';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<typeof TAB_SIGNALEMENTS | typeof TAB_SUPPORT>(
    TAB_SIGNALEMENTS,
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [total, setTotal] = useState(0);
  const [contactTotal, setContactTotal] = useState(0);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [contactDetail, setContactDetail] = useState<ContactRow | null>(null);

  const filterQs = useMemo(() => filtersToQuery(filters), [filters]);

  const exportHref = useMemo(
    () => `/api/admin/listing-reports/export${filterQs ? `?${filterQs.replace(/^&/, '')}` : ''}`,
    [filterQs],
  );

  useEffect(() => {
    let cancelled = false;
    api<Stats>('/api/admin/listing-reports/stats')
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        if (!cancelled) toast('Impossible de charger les statistiques.', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Contact-message tab badge — a lightweight count fetch, independent of
  // whether that tab is open.
  useEffect(() => {
    let cancelled = false;
    api<{ total: number }>('/api/admin/contact-messages?status=NEW&limit=1')
      .then((res) => {
        if (!cancelled) setContactTotal(res.total);
      })
      .catch(() => {
        /* non-fatal — badge just stays at 0 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchReports = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${filterQs}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await api<{ items: ReportRow[]; nextCursor: string | null; total: number }>(
        `/api/admin/listing-reports${qs}`,
      );
      setTotal(res.total);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [filterQs],
  );
  const reportsPager = useCursorPager<ReportRow>({
    perPage: PER_PAGE,
    total,
    fetchPage: fetchReports,
    resetKey: filterQs,
  });

  useEffect(() => {
    if (reportsPager.error) toast('Impossible de charger les signalements.', 'error');
  }, [reportsPager.error, toast]);

  const fetchContacts = useCallback(async (cursor: string | null) => {
    const qs = `?limit=${PER_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await api<{ items: ContactRow[]; nextCursor: string | null; total: number }>(
      `/api/admin/contact-messages${qs}`,
    );
    setContactTotal(res.total);
    return { items: res.items, nextCursor: res.nextCursor };
  }, []);
  const contactsPager = useCursorPager<ContactRow>({
    perPage: PER_PAGE,
    total: contactTotal,
    fetchPage: fetchContacts,
    resetKey: mainTab,
  });

  useEffect(() => {
    if (contactsPager.error) toast('Impossible de charger les messages.', 'error');
  }, [contactsPager.error, toast]);

  const refreshDetail = useCallback((id: string) => {
    return api<{ report: ReportDetail; history: HistoryEntry[] }>(
      `/api/admin/listing-reports/${id}`,
    ).then((res) => {
      setDetail(res.report);
      setHistory(res.history);
    });
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setHistory([]);
      setNoteDraft('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    refreshDetail(openId)
      .catch(() => {
        if (cancelled) return;
        toast('Impossible de charger le détail du signalement.', 'error');
        setOpenId(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, refreshDetail, toast]);

  useEffect(() => {
    if (!openContactId) {
      setContactDetail(null);
      return;
    }
    const row = contactsPager.items.find((c) => c.id === openContactId) ?? null;
    setContactDetail(row);
  }, [openContactId, contactsPager.items]);

  async function resolveReport(status: 'REVIEWED' | 'DISMISSED') {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await api(`/api/admin/listing-reports/${detail.id}`, { method: 'PATCH', body: { status } });
      await refreshDetail(detail.id);
      toast(status === 'REVIEWED' ? 'Signalement résolu.' : 'Signalement rejeté.', 'success');
      reportsPager.reload();
    } catch {
      toast("L'action a échoué. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!detail || busy || !noteDraft.trim()) return;
    setBusy(true);
    try {
      await api(`/api/admin/listing-reports/${detail.id}/notes`, {
        method: 'POST',
        body: { note: noteDraft.trim() },
      });
      setNoteDraft('');
      await refreshDetail(detail.id);
      toast('Note ajoutée.', 'success');
    } catch {
      toast("Impossible d'ajouter la note. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function suspendListing() {
    if (!detail || busy) return;
    setBusy(true);
    const reason = `Signalement : ${labelOr(REASON_LABEL, detail.reason)}${detail.detail ? ' — ' + detail.detail : ''}`;
    try {
      await api(`/api/admin/listings/${detail.listing.id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      await refreshDetail(detail.id);
      toast('Annonce suspendue.', 'success');
      reportsPager.reload();
    } catch {
      toast("Impossible de suspendre l'annonce. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function suspendUser() {
    if (!detail?.listing.owner || busy) return;
    setBusy(true);
    const reason = `Signalement : ${labelOr(REASON_LABEL, detail.reason)}${detail.detail ? ' — ' + detail.detail : ''}`;
    try {
      await api(`/api/admin/users/${detail.listing.owner.id}/status`, {
        method: 'PATCH',
        body: { status: 'SUSPENDED', reason },
      });
      toast('Utilisateur suspendu.', 'success');
    } catch {
      toast("Impossible de suspendre l'utilisateur. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function setContactStatus(id: string, status: 'READ' | 'ARCHIVED') {
    try {
      await api(`/api/admin/contact-messages/${id}`, { method: 'PATCH', body: { status } });
      setContactDetail((c) => (c && c.id === id ? { ...c, status } : c));
      contactsPager.reload();
      toast(status === 'ARCHIVED' ? 'Message archivé.' : 'Message marqué comme lu.', 'success');
    } catch {
      toast("L'action a échoué. Réessaie.", 'error');
    }
  }

  const reportRows = reportsPager.items;
  const contactRows = contactsPager.items;

  return (
    <AdminShell
      active="support"
      searchPlaceholder="Rechercher un signalement, un ticket, un utilisateur…"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-brand">
            Administration · Multi-pays agrégée
          </p>
          <h1 className="font-sora mt-1 text-2xl leading-tight font-bold text-neutral-900">
            Modération &amp; Support
          </h1>
        </div>
        <a
          href={exportHref}
          download
          className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900 hover:bg-gray-50"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden />
          Exporter
        </a>
      </div>

      {/* Main tabs */}
      <div className="flex w-fit items-center gap-1 rounded-xl border border-black/[0.08] bg-white p-1">
        <button
          type="button"
          onClick={() => setMainTab(TAB_SIGNALEMENTS)}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold',
            mainTab === TAB_SIGNALEMENTS ? 'bg-brand text-brand-foreground' : 'text-gray-400',
          )}
        >
          <Flag className="h-3.5 w-3.5" aria-hidden />
          Signalements
          <span
            className={cn(
              'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
              mainTab === TAB_SIGNALEMENTS ? 'bg-white/25' : 'bg-gray-100',
            )}
          >
            {stats?.pendingCount ?? 0}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab(TAB_SUPPORT)}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold',
            mainTab === TAB_SUPPORT ? 'bg-brand text-brand-foreground' : 'text-gray-400',
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Support client
          <span
            className={cn(
              'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
              mainTab === TAB_SUPPORT ? 'bg-white/25' : 'bg-gray-100',
            )}
          >
            {contactTotal}
          </span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AdminStatCard
          icon={<Clock className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
          tone="warning"
          label="Signalements en attente"
          value={String(stats?.pendingCount ?? '…')}
          sub="Nouveaux signalements à traiter"
        />
        <AdminStatCard
          icon={<CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" aria-hidden />}
          tone="success"
          label="Traités cette semaine"
          value={String(stats?.resolvedThisWeek ?? '…')}
          sub="Résolus ou rejetés"
        />
        <AdminStatCard
          icon={<Timer className="h-[18px] w-[18px] text-brand" aria-hidden />}
          label="Temps de traitement moyen"
          value={formatDuration(stats?.avgProcessingTimeMs ?? null)}
          sub="30 derniers jours"
        />
      </div>

      {mainTab === TAB_SIGNALEMENTS ? (
        <>
          <SignalementsFilterBar value={filters} onChange={setFilters} />

          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-[18px] py-4">
              <span className="font-sora text-[14px] font-bold text-neutral-900">
                {total} signalement{total > 1 ? 's' : ''}
              </span>
              <a
                href={exportHref}
                download
                className="flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-neutral-900 hover:bg-gray-50"
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden />
                Exporter CSV
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="bg-gray-50">
                    {['', 'Élément concerné', 'Motif', 'Gravité', 'Statut', 'Date', ''].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reportsPager.loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3.5 py-10 text-center text-[13px] text-gray-400"
                      >
                        Chargement…
                      </td>
                    </tr>
                  ) : reportRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3.5 py-10 text-center text-[13px] text-gray-400"
                      >
                        Aucun signalement pour l&apos;instant.
                      </td>
                    </tr>
                  ) : (
                    reportRows.map((s, i) => (
                      <tr
                        key={s.id}
                        onClick={() => setOpenId(s.id)}
                        className={cn(
                          'cursor-pointer border-t border-black/[0.05]',
                          i % 2 !== 0 ? 'bg-gray-50/60' : '',
                        )}
                      >
                        <td className="px-3.5 py-2.5">
                          <span
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg',
                              s.severity === 'CRITICAL'
                                ? 'bg-red-50'
                                : s.severity === 'MEDIUM'
                                  ? 'bg-amber-50'
                                  : 'bg-gray-100',
                            )}
                          >
                            <AlertOctagon
                              className={cn(
                                'h-4 w-4',
                                s.severity === 'CRITICAL'
                                  ? 'text-red-500'
                                  : s.severity === 'MEDIUM'
                                    ? 'text-amber-600'
                                    : 'text-gray-500',
                              )}
                              aria-hidden
                            />
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-brand">
                              {s.listing.title}
                            </div>
                            <div className="truncate text-[11px] text-gray-400">
                              {s.listing.city}, {s.listing.country}
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[160px] truncate px-3.5 py-2.5 text-[12px] text-gray-700">
                          {labelOr(REASON_LABEL, s.reason)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <AdminStatusBadge tone={SEVERITY_TONE[s.severity] ?? 'neutral'}>
                            {labelOr(SEVERITY_LABEL, s.severity)}
                          </AdminStatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <AdminStatusBadge tone={REPORT_STATUS_TONE[s.status] ?? 'neutral'}>
                            {labelOr(REPORT_STATUS_LABEL, s.status)}
                          </AdminStatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                          {formatDate(s.createdAt)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <button
                            type="button"
                            aria-label={`Voir — ${s.listing.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(s.id);
                            }}
                            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100"
                          >
                            <MoreHorizontal className="h-4 w-4 text-gray-400" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <AdminPagination
              from={reportsPager.from}
              to={reportsPager.to}
              total={total}
              itemLabel="signalements"
              perPage={PER_PAGE}
              pages={reportsPager.pageNumbers}
              activePage={reportsPager.page}
              onPrev={reportsPager.goPrev}
              onNext={reportsPager.goNext}
              onPage={reportsPager.goPage}
              disabledPrev={reportsPager.loading || reportsPager.page <= 1}
              disabledNext={reportsPager.loading || reportsPager.page >= reportsPager.pageCount}
            />
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.08] px-[18px] py-4">
            <span className="font-sora text-[14px] font-bold text-neutral-900">
              {contactTotal} message{contactTotal > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  {['Contact', 'Sujet', 'Message', 'Statut', 'Date', ''].map((h) => (
                    <th
                      key={h}
                      className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contactsPager.loading ? (
                  <tr>
                    <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                      Chargement…
                    </td>
                  </tr>
                ) : contactRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                      Aucun message pour l&apos;instant.
                    </td>
                  </tr>
                ) : (
                  contactRows.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => setOpenContactId(c.id)}
                      className={cn(
                        'cursor-pointer border-t border-black/[0.05]',
                        i % 2 !== 0 ? 'bg-gray-50/60' : '',
                      )}
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {c.firstName} {c.lastName}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{c.email}</div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px] text-neutral-900">
                        {labelOr(CONTACT_SUBJECT_LABEL, c.subject)}
                      </td>
                      <td className="max-w-[260px] truncate px-3.5 py-2.5 text-[12px] text-gray-500">
                        {c.message}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <AdminStatusBadge tone={CONTACT_STATUS_TONE[c.status] ?? 'neutral'}>
                          {labelOr(CONTACT_STATUS_LABEL, c.status)}
                        </AdminStatusBadge>
                      </td>
                      <td className="px-3.5 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${c.firstName} ${c.lastName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenContactId(c.id);
                          }}
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100"
                        >
                          <Eye className="h-4 w-4 text-neutral-900" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            from={contactsPager.from}
            to={contactsPager.to}
            total={contactTotal}
            itemLabel="messages"
            perPage={PER_PAGE}
            pages={contactsPager.pageNumbers}
            activePage={contactsPager.page}
            onPrev={contactsPager.goPrev}
            onNext={contactsPager.goNext}
            onPage={contactsPager.goPage}
            disabledPrev={contactsPager.loading || contactsPager.page <= 1}
            disabledNext={contactsPager.loading || contactsPager.page >= contactsPager.pageCount}
          />
        </div>
      )}

      {/* Signalement detail drawer */}
      <AdminDrawer
        open={openId != null}
        onClose={() => setOpenId(null)}
        title="Détail du signalement"
        titleExtra={
          detail && (
            <AdminStatusBadge tone={SEVERITY_TONE[detail.severity] ?? 'neutral'}>
              {labelOr(SEVERITY_LABEL, detail.severity)}
            </AdminStatusBadge>
          )
        }
        footer={
          detail && (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={busy || detail.listing.status === 'REJECTED'}
                  onClick={suspendListing}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Suspendre l&apos;annonce
                </button>
                <button
                  type="button"
                  disabled={busy || !detail.listing.owner}
                  onClick={suspendUser}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 disabled:opacity-50"
                >
                  <UserX className="h-3.5 w-3.5" aria-hidden />
                  Suspendre l&apos;utilisateur
                </button>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={busy || detail.status === 'REVIEWED'}
                  onClick={() => resolveReport('REVIEWED')}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Marquer comme résolu
                </button>
                <button
                  type="button"
                  disabled={busy || detail.status === 'DISMISSED'}
                  onClick={() => resolveReport('DISMISSED')}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter
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
            <div className="grid grid-cols-2 gap-2.5">
              <InfoItem k="Type" v="Annonce" />
              <InfoItem k="Motif" v={labelOr(REASON_LABEL, detail.reason)} />
              <InfoItem k="Gravité" v={labelOr(SEVERITY_LABEL, detail.severity)} tone="danger" />
              <InfoItem k="Signalé le" v={formatDateTime(detail.createdAt)} />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Élément concerné</p>
              <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3.5">
                {detail.listing.thumbnailUrl ? (
                  <img
                    src={detail.listing.thumbnailUrl}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-[10px] object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 flex-shrink-0 rounded-[10px] bg-gray-200" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-brand">
                    {detail.listing.title}
                  </div>
                  <div className="text-[12px] text-gray-400">
                    {detail.listing.city}, {detail.listing.country} ·{' '}
                    {formatFcfa(detail.listing.price, detail.listing.currency)}
                  </div>
                  {detail.listing.owner && (
                    <div className="mt-1 text-[12px] text-gray-400">
                      Publiée par : {detail.listing.owner.name ?? detail.listing.owner.email}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {detail.detail && (
              <div>
                <p className="mb-1.5 text-[12px] font-bold text-gray-400">
                  Description du signalement
                </p>
                <div className="rounded-2xl bg-gray-50 p-3.5">
                  <p className="text-[13px] leading-relaxed text-gray-700">{detail.detail}</p>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-gray-50 p-3 text-[12px] text-gray-500">
              Le signalant reste anonyme — le formulaire public ne capture aucune identité, par
              conception, pour ne pas notifier l&apos;équipe signalement par signalement.
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Historique de traitement</p>
              <div className="flex flex-col gap-3">
                {history.map((h, i) => (
                  <div key={h.id} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-[5px] h-2 w-2 flex-shrink-0 rounded-full',
                        i === history.length - 1 ? 'bg-brand' : 'bg-gray-200',
                      )}
                      aria-hidden
                    />
                    <div>
                      <div className="text-[13px] leading-snug text-gray-700">{historyText(h)}</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {formatDateTime(h.createdAt)}
                        {h.actor ? ` · ${h.actor}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 p-3.5">
              <label className="mb-2 block text-[12px] font-semibold text-gray-400">
                Ajouter une note interne
              </label>
              <textarea
                rows={2}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Écrire une note pour l'équipe…"
                className="w-full resize-none rounded-lg border border-black/[0.08] bg-white px-3 py-2.5 text-[13px] text-neutral-900 outline-none placeholder:text-gray-400 focus:border-brand"
              />
              <button
                type="button"
                disabled={busy || !noteDraft.trim()}
                onClick={addNote}
                className="mt-2 flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold whitespace-nowrap text-brand-foreground disabled:opacity-50"
              >
                Enregistrer la note
              </button>
            </div>
          </>
        )}
      </AdminDrawer>

      {/* Contact-message detail drawer */}
      <AdminDrawer
        open={openContactId != null}
        onClose={() => setOpenContactId(null)}
        title="Message de support"
        titleExtra={
          contactDetail && (
            <AdminStatusBadge tone={CONTACT_STATUS_TONE[contactDetail.status] ?? 'neutral'}>
              {labelOr(CONTACT_STATUS_LABEL, contactDetail.status)}
            </AdminStatusBadge>
          )
        }
        footer={
          contactDetail && (
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={contactDetail.status === 'READ'}
                onClick={() => setContactStatus(contactDetail.id, 'READ')}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900 disabled:opacity-50"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Marquer comme lu
              </button>
              <button
                type="button"
                disabled={contactDetail.status === 'ARCHIVED'}
                onClick={() => setContactStatus(contactDetail.id, 'ARCHIVED')}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600 disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archiver
              </button>
            </div>
          )
        }
      >
        {!contactDetail ? (
          <p className="py-10 text-center text-[13px] text-gray-400">Chargement…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <InfoItem k="Sujet" v={labelOr(CONTACT_SUBJECT_LABEL, contactDetail.subject)} />
              <InfoItem k="Reçu le" v={formatDateTime(contactDetail.createdAt)} />
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Contact</p>
              <div className="flex flex-col gap-2.5 rounded-2xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 text-[13px] text-neutral-900">
                  <Mail className="h-3.5 w-3.5 text-brand" aria-hidden />
                  {contactDetail.email}
                </div>
                {contactDetail.phone && (
                  <div className="flex items-center gap-2 text-[13px] text-neutral-900">
                    <Phone className="h-3.5 w-3.5 text-brand" aria-hidden />
                    {contactDetail.phone}
                  </div>
                )}
                {contactDetail.country && (
                  <div className="flex items-center gap-2 text-[13px] text-neutral-900">
                    <Globe className="h-3.5 w-3.5 text-brand" aria-hidden />
                    {contactDetail.country}
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Message</p>
              <div className="rounded-2xl bg-gray-50 p-3.5">
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-gray-700">
                  {contactDetail.message}
                </p>
              </div>
            </div>
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function InfoItem({ k, v, tone }: { k: string; v: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-[11px] text-gray-400">{k}</div>
      <div
        className={cn(
          'text-[13px] font-semibold',
          tone === 'danger' ? 'text-red-500' : 'text-neutral-900',
        )}
      >
        {v}
      </div>
    </div>
  );
}
