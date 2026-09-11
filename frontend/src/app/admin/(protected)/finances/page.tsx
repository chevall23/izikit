'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Coins, Landmark, TrendingUp, Receipt, Smartphone } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminCard } from '@/components/admin/AdminCard';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCursorPager } from './use-cursor-pager';

// ── API shapes (GET /api/admin/finances/summary, /transactions) ────────────

interface Summary {
  currency: string;
  kpis: {
    tokenRevenue: { amount: number; deltaPct: number | null; packsSold: number };
    subscriptionRevenue: { amount: number; deltaPct: number | null };
    totalRevenue: { amount: number; deltaPct: number | null };
    transactions: { total: number; succeeded: number; failed: number };
  };
  revenueSeries: { month: string; tokenAmount: number; subscriptionAmount: number }[];
  countryShare: { country: string; amount: number; pct: number }[];
}

type TxnType = 'TOKEN_PURCHASE' | 'SUBSCRIPTION' | 'OTHER';

interface TxnRow {
  id: string;
  type: TxnType;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
}

// ── Config / labels ─────────────────────────────────────────────────────────

type TabKey = 'ALL' | 'TOKEN_PURCHASE' | 'SUBSCRIPTION' | 'REFUNDED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'TOKEN_PURCHASE', label: 'Achats jetons' },
  { key: 'SUBSCRIPTION', label: 'Abonnements' },
  { key: 'REFUNDED', label: 'Remboursées' },
];

const TYPE_LABEL: Record<TxnType, string> = {
  TOKEN_PURCHASE: 'Achat jetons',
  SUBSCRIPTION: 'Abonnement',
  OTHER: 'Autre',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  PAID: 'Réussi',
  EXPIRED: 'Expiré',
  FAILED: 'Échoué',
  REFUNDED: 'Remboursé',
};
const STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING: 'warning',
  PAID: 'success',
  EXPIRED: 'neutral',
  FAILED: 'danger',
  REFUNDED: 'danger',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  FREE_MONEY: 'Free Money',
};

const COUNTRY_COLORS = ['#376BFF', '#10B981', '#F59E0B', '#6B7280', '#EC4899', '#8B5CF6'];
const DONUT_R = 46;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

const PER_PAGE = 20;

// ── Formatters ───────────────────────────────────────────────────────────────

function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
}
function formatCompactFcfa(n: number): string {
  return `${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)} FCFA`;
}
function formatDelta(pct: number | null): { text: string; tone: 'up' | 'warn' | 'neutral' } {
  if (pct == null) return { text: 'Nouveau', tone: 'neutral' };
  const tone = pct > 0 ? 'up' : pct < 0 ? 'warn' : 'neutral';
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(1)}%`, tone };
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'short',
  });
}
function shortRef(id: string): string {
  return `Réf. ${id.slice(-6).toUpperCase()}`;
}
function initials(name: string | null, fallback: string): string {
  const src = (name ?? fallback).trim();
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminFinancesPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('ALL');
  const [q, setQ] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    api<Summary>('/api/admin/finances/summary')
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch(() => {
        if (!cancelled) toast('Impossible de charger le résumé financier.', 'error');
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const typeParam = tab === 'TOKEN_PURCHASE' || tab === 'SUBSCRIPTION' ? `&type=${tab}` : '';
  const statusParam = tab === 'REFUNDED' ? '&status=REFUNDED' : '';
  const qParam = q ? `&q=${encodeURIComponent(q)}` : '';

  const exportHref = useMemo(() => {
    const parts = [
      tab === 'TOKEN_PURCHASE' || tab === 'SUBSCRIPTION' ? `type=${tab}` : '',
      tab === 'REFUNDED' ? 'status=REFUNDED' : '',
      q ? `q=${encodeURIComponent(q)}` : '',
    ].filter(Boolean);
    return `/api/admin/finances/transactions/export${parts.length ? `?${parts.join('&')}` : ''}`;
  }, [tab, q]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${typeParam}${statusParam}${qParam}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await api<{ items: TxnRow[]; nextCursor: string | null; total: number }>(
        `/api/admin/finances/transactions${qs}`,
      );
      setTotal(res.total);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [typeParam, statusParam, qParam],
  );

  const pager = useCursorPager<TxnRow>({
    perPage: PER_PAGE,
    total,
    fetchPage,
    resetKey: `${tab}|${q}`,
  });

  useEffect(() => {
    if (pager.error) toast('Impossible de charger les transactions.', 'error');
  }, [pager.error, toast]);

  const rows = pager.items;

  const chart = useMemo(() => {
    const series = summary?.revenueSeries ?? [];
    const max = Math.max(1, ...series.map((s) => s.tokenAmount + s.subscriptionAmount));
    const n = Math.max(1, series.length - 1);
    const toXY = (i: number, v: number) => `${(i / n) * 700},${190 - (v / max) * 170 - 10}`;
    const tokenPoints = series.map((s, i) => toXY(i, s.tokenAmount)).join(' ');
    const subPoints = series.map((s, i) => toXY(i, s.subscriptionAmount)).join(' ');
    const lastToken = series.length ? series[series.length - 1]!.tokenAmount : 0;
    const lastSub = series.length ? series[series.length - 1]!.subscriptionAmount : 0;
    return {
      tokenPoints,
      subPoints,
      areaPoints: `${tokenPoints} 700,190 0,190`,
      lastTokenY: 190 - (lastToken / max) * 170 - 10,
      lastSubY: 190 - (lastSub / max) * 170 - 10,
      xTicks: series.map((s) => monthLabel(s.month)),
      yTicks: [max, (max * 3) / 4, max / 2, max / 4, 0].map(formatCompactFcfa),
    };
  }, [summary?.revenueSeries]);

  const donut = useMemo(() => {
    let offset = 0;
    const segments = (summary?.countryShare ?? []).map((c, i) => {
      const dash = (c.pct / 100) * DONUT_CIRCUMFERENCE;
      const seg = {
        ...c,
        color: COUNTRY_COLORS[i % COUNTRY_COLORS.length]!,
        dash: `${dash.toFixed(1)} ${(DONUT_CIRCUMFERENCE - dash).toFixed(1)}`,
        offset: `${-offset.toFixed(1)}`,
      };
      offset += dash;
      return seg;
    });
    return segments;
  }, [summary?.countryShare]);

  const kpis = summary?.kpis;
  const tokenDelta = formatDelta(kpis?.tokenRevenue.deltaPct ?? null);
  const subDelta = formatDelta(kpis?.subscriptionRevenue.deltaPct ?? null);
  const totalDelta = formatDelta(kpis?.totalRevenue.deltaPct ?? null);

  return (
    <AdminShell
      active="finance"
      searchPlaceholder="Rechercher une transaction, un utilisateur ou une référence…"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">
            Revenus &amp; Transactions · Multi-pays agrégée
          </p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Finances &amp; Jetons
          </h1>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-gray-400">
            Suivi des revenus et transactions (achats de jetons et abonnements) pour l&apos;ensemble
            des pays.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={exportHref}
            download
            className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter CSV
          </a>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiCard
          icon={<Coins className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta={tokenDelta.text}
          deltaTone={tokenDelta.tone}
          value={summaryLoading ? '…' : formatFcfa(kpis?.tokenRevenue.amount ?? 0)}
          label="Revenus jetons · ce mois"
          footLeft={`${kpis?.tokenRevenue.packsSold ?? 0} pack${(kpis?.tokenRevenue.packsSold ?? 0) > 1 ? 's' : ''} vendu${(kpis?.tokenRevenue.packsSold ?? 0) > 1 ? 's' : ''}`}
          footRight="vs mois dernier"
        />
        <AdminKpiCard
          icon={<Landmark className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta={subDelta.text}
          deltaTone={subDelta.tone}
          value={summaryLoading ? '…' : formatFcfa(kpis?.subscriptionRevenue.amount ?? 0)}
          label="Revenus abonnements · ce mois"
          footLeft="Changements de forfait payés"
          footRight="vs mois dernier"
        />
        <AdminKpiCard
          icon={<TrendingUp className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta={totalDelta.text}
          deltaTone={totalDelta.tone}
          value={summaryLoading ? '…' : formatFcfa(kpis?.totalRevenue.amount ?? 0)}
          label="Total du mois"
          footLeft="Jetons + abonnements"
          footRight="Mois en cours"
        />
        <AdminKpiCard
          icon={<Receipt className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
          delta={
            kpis && kpis.transactions.total > 0
              ? `${Math.round((kpis.transactions.failed / kpis.transactions.total) * 100)}% échouées`
              : '—'
          }
          deltaTone={kpis && kpis.transactions.failed > 0 ? 'warn' : 'neutral'}
          value={summaryLoading ? '…' : String(kpis?.transactions.total ?? 0)}
          label="Transactions du mois"
          footLeft={`Réussies : ${kpis?.transactions.succeeded ?? 0} · Échouées : ${kpis?.transactions.failed ?? 0}`}
          footRight="Mois en cours"
        />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <AdminCard
          title="Évolution des revenus sur 6 mois"
          subtitle="Jetons + abonnements — tendance consolidée multi-pays."
        >
          <div className="mb-3 flex flex-wrap items-center gap-3.5">
            <span className="flex items-center gap-1.5 text-[12px] text-gray-700">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: '#376BFF' }}
              />
              Jetons
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-gray-700">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: '#10B981' }}
              />
              Abonnements
            </span>
          </div>
          <div className="grid h-[220px] grid-cols-[56px_minmax(0,1fr)] gap-2">
            <div className="flex flex-col justify-between pt-2 pb-[22px] text-right text-[11px] text-gray-400">
              {chart.yTicks.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
            <div
              className="relative overflow-hidden rounded-lg px-3 pt-2 pb-6"
              style={{
                background:
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 24%, #F3F4F6 24%, #F3F4F6 25%, transparent 25%)',
              }}
            >
              <svg
                className="block h-full w-full"
                viewBox="0 0 700 190"
                preserveAspectRatio="none"
                role="img"
                aria-label="Évolution des revenus jetons et abonnements sur 6 mois"
              >
                <polygon points={chart.areaPoints} fill="#376BFF1A" />
                <polyline
                  points={chart.tokenPoints}
                  fill="none"
                  stroke="#376BFF"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={chart.subPoints}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={700} cy={chart.lastTokenY} r={4} fill="#376BFF" />
                <circle cx={700} cy={chart.lastSubY} r={4} fill="#10B981" />
              </svg>
              <div className="absolute right-3 bottom-0 left-3 grid grid-cols-6 text-[11px] text-gray-400">
                {chart.xTicks.map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </AdminCard>

        <AdminCard
          title="Répartition des revenus par pays"
          subtitle="Part de chaque marché dans le total du mois."
        >
          {donut.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-gray-400">
              Aucun revenu ce mois-ci pour l&apos;instant.
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-5">
              <svg viewBox="0 0 120 120" width="120" height="120" className="flex-shrink-0">
                {donut.map((c) => (
                  <circle
                    key={c.country}
                    cx="60"
                    cy="60"
                    r={DONUT_R}
                    fill="none"
                    stroke={c.color}
                    strokeWidth="18"
                    strokeDasharray={c.dash}
                    strokeDashoffset={c.offset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
                <circle cx="60" cy="60" r="36" fill="#fff" />
                <text
                  x="60"
                  y="56"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="#111827"
                >
                  {formatCompactFcfa(kpis?.totalRevenue.amount ?? 0)}
                </text>
                <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#9CA3AF">
                  total
                </text>
              </svg>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                {donut.map((c) => (
                  <div
                    key={c.country}
                    className="flex items-center gap-2 text-[12px] text-neutral-900"
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]"
                      style={{ background: c.color }}
                    />
                    <span className="truncate">{c.country}</span>
                    <span className="ml-auto text-[12px] font-bold whitespace-nowrap">
                      {c.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminCard>
      </section>

      {/* Transactions table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-[18px] py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-sora text-[15px] font-bold whitespace-nowrap text-neutral-900">
              Transactions
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex h-8 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                    t.key === tab ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un utilisateur…"
              aria-label="Rechercher une transaction"
              className="h-8 w-[220px] rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] outline-none focus:border-brand"
            />
            <a
              href={exportHref}
              download
              className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-neutral-900 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Exporter
            </a>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {[
                  'Utilisateur',
                  'Type',
                  'Montant',
                  'Moyen de paiement',
                  'Statut',
                  'Date / heure',
                ].map((h) => (
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
              {pager.loading ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune transaction dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((t, i) => (
                  <tr
                    key={t.id}
                    className={cn(
                      'border-t border-black/[0.05]',
                      i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {t.user?.avatarUrl ? (
                          <img
                            src={t.user.avatarUrl}
                            alt=""
                            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                            {initials(t.user?.name ?? null, t.user?.email ?? '?')}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {t.user?.name ?? t.user?.email ?? 'Invité'}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">
                            {t.user?.email ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-[13px] text-neutral-900">
                      {TYPE_LABEL[t.type]}
                    </td>
                    <td
                      className={cn(
                        'px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap',
                        t.status === 'REFUNDED' ? 'text-red-500' : 'text-neutral-900',
                      )}
                    >
                      {t.status === 'REFUNDED' ? '-' : ''}
                      {formatFcfa(t.amount)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-gray-700">
                        <Smartphone className="h-3 w-3" aria-hidden />
                        {t.paymentMethod
                          ? (PAYMENT_METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod)
                          : '—'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[t.status] ?? 'neutral'}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] whitespace-nowrap text-neutral-900">
                          {formatDateTime(t.createdAt)}
                        </div>
                        <div className="truncate text-[11px] whitespace-nowrap text-gray-400">
                          {shortRef(t.id)}
                        </div>
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
          itemLabel="transactions"
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
    </AdminShell>
  );
}
