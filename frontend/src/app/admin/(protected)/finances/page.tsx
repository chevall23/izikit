'use client';

import { useState } from 'react';
import {
  Download,
  FileBarChart,
  Coins,
  Landmark,
  TrendingUp,
  Receipt,
  ChevronDown,
  SlidersHorizontal,
  Smartphone,
  CreditCard,
  Building2,
  Eye,
  RotateCcw,
  Pencil,
  MoreHorizontal,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminCard, AdminMiniFilter } from '@/components/admin/AdminCard';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Finances Jetons") ───────────────────────────────

const KPIS = [
  {
    icon: Coins,
    delta: '+14,2%',
    tone: 'up' as const,
    value: '42,3 M FCFA',
    label: 'Revenus jetons · juillet',
    footLeft: '4 812 packs vendus',
    footRight: 'vs juin',
  },
  {
    icon: Landmark,
    delta: '+9,8%',
    tone: 'up' as const,
    value: '31,9 M FCFA',
    label: 'Revenus commissions · juillet',
    footLeft: 'Ventes confirmées',
    footRight: 'vs juin',
  },
  {
    icon: TrendingUp,
    delta: '+11,1%',
    tone: 'up' as const,
    value: '84,7 M FCFA',
    label: 'Total du mois',
    footLeft: '↑ 8,5 M vs juin',
    footRight: 'Juillet 2025',
  },
  {
    icon: Receipt,
    delta: '-3,2%',
    tone: 'warn' as const,
    value: '1 847',
    label: 'Transactions du mois',
    footLeft: 'Réussies : 1 712 · Échouées : 135',
    footRight: 'Juillet 2025',
  },
];

const REVENUE_SERIES = [
  {
    label: 'Jetons',
    color: '#376BFF',
    width: 3,
    points: '0,148 140,138 280,120 420,100 560,88 700,70',
    endY: 70,
  },
  {
    label: 'Commissions',
    color: '#10B981',
    width: 2.5,
    points: '0,162 140,154 280,144 420,128 560,118 700,108',
    endY: 108,
  },
  {
    label: 'VR',
    color: '#F59E0B',
    width: 2,
    points: '0,174 140,170 280,165 420,158 560,152 700,144',
    endY: 144,
  },
];
const REVENUE_Y_TICKS = ['50 M', '37 M', '25 M', '12 M', '0'];
const REVENUE_X_TICKS = ['Fév.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.'];

const COUNTRY_SHARE = [
  { label: "Côte d'Ivoire", color: '#376BFF', pct: 38, dash: '109.7 289.3', offset: '0' },
  { label: 'Sénégal', color: '#10B981', pct: 28, dash: '80.9 317.7', offset: '-109.7' },
  { label: 'Bénin', color: '#F59E0B', pct: 20, dash: '57.8 341', offset: '-190.6' },
  { label: 'Togo', color: '#6B7280', pct: 14, dash: '40.5 358.4', offset: '-248.4' },
];

const TXN_FILTERS = ['Toutes', 'Achats jetons', 'Commissions', 'Remboursements'];

interface Transaction {
  name: string;
  email: string;
  avatarUrl: string;
  type: string;
  sub: string;
  amount: string;
  amountTone?: 'brand' | 'success' | 'danger';
  payIcon: typeof Smartphone;
  payLabel: string;
  status: { label: string; tone: AdminStatusTone };
  date: string;
  ref: string;
}
const TRANSACTIONS: Transaction[] = [
  {
    name: 'Awa Diallo',
    email: 'awa.diallo@gmail.com',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F2',
    type: 'Achat jetons',
    sub: 'Pack 50 jetons',
    amount: '125 000 FCFA',
    amountTone: 'brand',
    payIcon: Smartphone,
    payLabel: 'Mobile Money',
    status: { label: 'Réussi', tone: 'success' },
    date: 'Juil. 30, 09:14',
    ref: 'Réf. TXN-28491',
  },
  {
    name: 'Agence Horizon Immo',
    email: 'contact@horizonimmo.sn',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FSouth%20Asian%2F1',
    type: 'Commission',
    sub: 'Vente confirmée',
    amount: '420 000 FCFA',
    amountTone: 'success',
    payIcon: Smartphone,
    payLabel: 'Mobile Money',
    status: { label: 'Réussi', tone: 'success' },
    date: 'Juil. 29, 16:42',
    ref: 'Réf. TXN-28470',
  },
  {
    name: 'Koffi Amegah',
    email: 'k.amegah@tg.immo',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F4',
    type: 'Achat jetons',
    sub: 'Pack 20 jetons',
    amount: '50 000 FCFA',
    payIcon: CreditCard,
    payLabel: 'Carte bancaire',
    status: { label: 'En attente', tone: 'warning' },
    date: 'Juil. 29, 11:08',
    ref: 'Réf. TXN-28441',
  },
  {
    name: 'Mariama Koné',
    email: 'm.kone@babi-prestige.ci',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F7',
    type: 'Remboursement',
    sub: 'Annulation pack VR',
    amount: '-75 000 FCFA',
    amountTone: 'danger',
    payIcon: Building2,
    payLabel: 'Virement',
    status: { label: 'Remboursé', tone: 'danger' },
    date: 'Juil. 28, 14:55',
    ref: 'Réf. TXN-28398',
  },
  {
    name: 'Jean-Pierre Adjovi',
    email: 'jp.adjovi@immo-bj.com',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F50-65%2FAfrican%2F5',
    type: 'Achat jetons',
    sub: 'Pack 100 jetons',
    amount: '250 000 FCFA',
    payIcon: Smartphone,
    payLabel: 'Mobile Money',
    status: { label: 'Échoué', tone: 'danger' },
    date: 'Juil. 28, 08:30',
    ref: 'Réf. TXN-28371',
  },
];

const COUNTRY_PRICING = [
  { flag: '🇧🇯', name: 'Bénin', unit: '2 500', sale: '3,5', rent: '8,0' },
  { flag: '🇨🇮', name: "Côte d'Ivoire", unit: '2 800', sale: '4,0', rent: '9,0' },
  { flag: '🇹🇬', name: 'Togo', unit: '2 200', sale: '3,0', rent: '7,5' },
  { flag: '🇸🇳', name: 'Sénégal', unit: '3 000', sale: '4,5', rent: '10,0' },
];

const PRICING_HISTORY = [
  {
    title: 'Jeton CI : 2 500 → 2 800 FCFA',
    author: 'Kofi Mensah (Admin)',
    time: '28 juil. 2025',
    dot: 'bg-brand',
  },
  {
    title: 'Commission SN vente : 4,0% → 4,5%',
    author: 'Fatou Sow (Finance Admin)',
    time: '15 juil. 2025',
    dot: 'bg-emerald-500',
  },
  {
    title: 'Jeton TG : 2 000 → 2 200 FCFA',
    author: 'Kofi Mensah (Admin)',
    time: '02 juil. 2025',
    dot: 'bg-amber-500',
  },
  {
    title: 'Commission BJ location : 7,0% → 8,0%',
    author: 'Fatou Sow (Finance Admin)',
    time: '18 juin 2025',
    dot: 'bg-emerald-500',
  },
  {
    title: 'Pack jetons VR : nouveau tarif créé',
    author: 'Kofi Mensah (Admin)',
    time: '05 juin 2025',
    dot: 'bg-gray-300',
  },
  {
    title: 'Commission CI location : 8,5% → 9,0%',
    author: 'Fatou Sow (Finance Admin)',
    time: '22 mai 2025',
    dot: 'bg-gray-300',
  },
];

const PERIODS = ['7j', '30j', '6 mois', 'Année'];

const AMOUNT_TONE: Record<'brand' | 'success' | 'danger', string> = {
  brand: 'text-brand',
  success: 'text-emerald-600',
  danger: 'text-red-500',
};

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminFinancesPage() {
  const [period, setPeriod] = useState('6 mois');
  const [txnFilter, setTxnFilter] = useState('Toutes');

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
            Suivi des revenus, transactions et paramétrage de la tarification pour l&apos;ensemble
            des pays.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter CSV
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
          >
            <FileBarChart className="h-3.5 w-3.5" aria-hidden />
            Rapport financier
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <AdminKpiCard
            key={k.label}
            icon={<k.icon className="h-[18px] w-[18px] text-brand" aria-hidden />}
            delta={k.delta}
            deltaTone={k.tone}
            value={k.value}
            label={k.label}
            footLeft={k.footLeft}
            footRight={k.footRight}
          />
        ))}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <AdminCard
          title="Évolution des revenus sur 6 mois"
          subtitle="Jetons + commissions + VR — tendance consolidée multi-pays."
          headerRight={
            <div className="flex items-center gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap',
                    p === period ? 'bg-brand text-brand-foreground' : 'bg-gray-100 text-gray-400',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-3.5">
            {REVENUE_SERIES.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-[12px] text-gray-700">
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
          <div className="grid h-[220px] grid-cols-[48px_minmax(0,1fr)] gap-2">
            <div className="flex flex-col justify-between pt-2 pb-[22px] text-right text-[11px] text-gray-400">
              {REVENUE_Y_TICKS.map((t) => (
                <span key={t}>{t}</span>
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
                aria-label="Évolution des revenus jetons, commissions et VR sur 6 mois"
              >
                <polygon
                  points="0,148 140,138 280,120 420,100 560,88 700,70 700,190 0,190"
                  fill="#376BFF1A"
                />
                {REVENUE_SERIES.map((s) => (
                  <polyline
                    key={s.label}
                    points={s.points}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {REVENUE_SERIES.map((s) => (
                  <circle key={s.label} cx={700} cy={s.endY} r={4} fill={s.color} />
                ))}
              </svg>
              <div className="absolute right-3 bottom-0 left-3 grid grid-cols-6 text-[11px] text-gray-400">
                {REVENUE_X_TICKS.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </AdminCard>

        <AdminCard
          title="Répartition des revenus par pays"
          subtitle="Part de chaque marché dans le total du mois."
          headerRight={
            <AdminMiniFilter>
              Juillet 2025
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
            </AdminMiniFilter>
          }
        >
          <div className="mt-2 flex items-center gap-5">
            <svg viewBox="0 0 120 120" width="120" height="120" className="flex-shrink-0">
              {COUNTRY_SHARE.map((c) => (
                <circle
                  key={c.label}
                  cx="60"
                  cy="60"
                  r="46"
                  fill="none"
                  stroke={c.color}
                  strokeWidth="18"
                  strokeDasharray={c.dash}
                  strokeDashoffset={c.offset}
                  transform="rotate(-90 60 60)"
                />
              ))}
              <circle cx="60" cy="60" r="36" fill="#fff" />
              <text x="60" y="56" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
                84,7 M
              </text>
              <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#9CA3AF">
                FCFA total
              </text>
            </svg>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {COUNTRY_SHARE.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[12px] text-neutral-900">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]"
                    style={{ background: c.color }}
                  />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto text-[12px] font-bold whitespace-nowrap">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
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
              {TXN_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxnFilter(f)}
                  className={cn(
                    'flex h-8 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                    f === txnFilter ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full bg-gray-100 px-3 text-[12px] font-semibold whitespace-nowrap text-gray-700"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filtres
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-neutral-900"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Exporter
            </button>
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
                  '',
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
              {TRANSACTIONS.map((t, i) => (
                <tr
                  key={t.ref}
                  className={`border-t border-black/[0.05] ${i % 2 === 0 ? '' : 'bg-gray-50/60'}`}
                >
                  <td className="px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <img
                        src={t.avatarUrl}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">
                          {t.name}
                        </div>
                        <div className="truncate text-[11px] text-gray-400">{t.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-neutral-900">{t.type}</div>
                      <div className="truncate text-[11px] text-gray-400">{t.sub}</div>
                    </div>
                  </td>
                  <td
                    className={cn(
                      'px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap',
                      t.amountTone ? AMOUNT_TONE[t.amountTone] : 'text-neutral-900',
                    )}
                  >
                    {t.amount}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-gray-700">
                      <t.payIcon className="h-3 w-3" aria-hidden />
                      {t.payLabel}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <AdminStatusBadge tone={t.status.tone}>{t.status.label}</AdminStatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] whitespace-nowrap text-neutral-900">
                        {t.date}
                      </div>
                      <div className="truncate text-[11px] whitespace-nowrap text-gray-400">
                        {t.ref}
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        aria-label={`Voir — ${t.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                      >
                        <Eye className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Actions — ${t.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                      >
                        {t.status.label === 'Échoué' ? (
                          <RotateCcw className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                        ) : t.status.label === 'En attente' ? (
                          <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                        ) : (
                          <Receipt className="h-3.5 w-3.5 text-brand" aria-hidden />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminPagination
          from={1}
          to={5}
          total={1847}
          itemLabel="transactions"
          perPage={25}
          pages={[1, 2, 3, '…', 74]}
          activePage={1}
        />
      </div>

      {/* Pricing settings */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <AdminCard
          title="Paramétrage de la tarification"
          subtitle="Prix des jetons et taux de commission par pays et type de transaction."
          headerRight={
            <button
              type="button"
              className="flex h-[34px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-neutral-900"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Modifier
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {COUNTRY_PRICING.map((c) => (
              <div key={c.name} className="flex flex-col gap-1.5">
                <div className="border-b border-black/[0.08] pb-1.5 text-[12px] font-bold text-brand">
                  {c.flag} {c.name} (FCFA)
                </div>
                <PricingRow label="Jeton unitaire" sub="Prix de base" value={c.unit} unit="FCFA" />
                <PricingRow
                  label="Commission vente"
                  sub="% sur transaction"
                  value={c.sale}
                  unit="%"
                />
                <PricingRow
                  label="Commission location"
                  sub="% sur 1er loyer"
                  value={c.rent}
                  unit="%"
                />
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard
          title="Historique des modifications tarifaires"
          subtitle="Toutes les révisions effectuées sur les prix et commissions."
        >
          <div className="flex flex-col">
            {PRICING_HISTORY.map((h) => (
              <div
                key={h.title}
                className="flex items-start gap-3 border-b border-black/[0.05] py-2.5 last:border-b-0"
              >
                <span
                  className={cn('mt-[5px] h-2 w-2 flex-shrink-0 rounded-full', h.dot)}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-neutral-900">{h.title}</div>
                  <div className="truncate text-[11px] text-gray-400">Par {h.author}</div>
                </div>
                <span className="flex-shrink-0 text-[11px] whitespace-nowrap text-gray-400">
                  {h.time}
                </span>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>
    </AdminShell>
  );
}

function PricingRow({
  label,
  sub,
  value,
  unit,
}: {
  label: string;
  sub: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-[13px] text-neutral-900">{label}</div>
        <div className="truncate text-[11px] text-gray-400">{sub}</div>
      </div>
      <span className="flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
        {value} <span className="text-[11px] font-normal text-gray-400">{unit}</span>
      </span>
    </div>
  );
}
