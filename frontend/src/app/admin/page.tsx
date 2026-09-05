import {
  Download,
  FileText,
  Building,
  UserPlus,
  WalletCards,
  BadgePercent,
  ChevronDown,
  Eye,
  Check,
  Pencil,
  ArrowUpRight,
  FileWarning,
  Trash2,
  Rocket,
  MoreHorizontal,
  Building2,
  ShieldAlert,
  CreditCard,
  UserRoundX,
  Clock3,
  Siren,
  Coins,
  Landmark,
  Video,
  TabletSmartphone,
  type LucideIcon,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminCard, AdminMiniFilter } from '@/components/admin/AdminCard';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Admin Dashboard") ──────────────────────────────

const KPIS = [
  {
    icon: Building,
    delta: '+8,2%',
    tone: 'up' as const,
    value: '12 480',
    label: 'Annonces actives',
    footLeft: '1 124 nouvelles ce mois',
    footRight: '30 jours',
  },
  {
    icon: UserPlus,
    delta: '+14,6%',
    tone: 'up' as const,
    value: '986',
    label: 'Nouvelles inscriptions · 7j',
    footLeft: 'Agences, particuliers, démarcheurs',
    footRight: '7 jours',
  },
  {
    icon: WalletCards,
    delta: '+11,1%',
    tone: 'up' as const,
    value: '84,7 M FCFA',
    label: 'Revenus du mois',
    footLeft: 'Jetons + commissions',
    footRight: 'Juillet 2025',
  },
  {
    icon: BadgePercent,
    delta: '+1,9 pt',
    tone: 'warn' as const,
    value: '18,4%',
    label: 'Conversion visite → vente',
    footLeft: 'Référence régionale',
    footRight: '30 jours',
  },
];

const LINE_SERIES = [
  {
    label: 'Bénin',
    color: '#376BFF',
    width: 4,
    points: '0,168 150,154 305,136 455,116 610,102 760,78',
  },
  {
    label: 'Togo',
    color: '#111827',
    width: 3,
    points: '0,182 150,174 305,166 455,144 610,130 760,124',
  },
  {
    label: "Côte d'Ivoire",
    color: '#F59E0B',
    width: 3,
    points: '0,158 150,148 305,122 455,96 610,88 760,70',
  },
  {
    label: 'Sénégal',
    color: '#10B981',
    width: 3,
    points: '0,192 150,180 305,170 455,164 610,142 760,132',
  },
];
const LINE_END = [
  { color: '#376BFF', y: 78 },
  { color: '#111827', y: 124 },
  { color: '#F59E0B', y: 70 },
  { color: '#10B981', y: 132 },
];
const LINE_Y_TICKS = ['320', '240', '160', '80', '0'];
const LINE_X_TICKS = ['01 juil.', '06 juil.', '12 juil.', '18 juil.', '24 juil.', '30 juil.'];

const BARS = [
  { label: 'Villa', light: 118, solid: 152, meta: '2 940 annonces' },
  { label: 'Appartement', light: 102, solid: 166, meta: '3 184 annonces' },
  { label: 'Terrain', light: 92, solid: 130, meta: '2 215 annonces' },
  { label: 'Bureau', light: 76, solid: 104, meta: '1 420 annonces' },
];

const TABLE_TABS = ['Toutes', 'En attente', 'Validées', 'Rejetées'];
interface Row {
  name: string;
  ref: string;
  place: string;
  price: string;
  type: string;
  status: { tone: AdminStatusTone; label: string };
  thumb: string;
  actions: { icon: LucideIcon; className: string }[];
}
const ROWS: Row[] = [
  {
    name: 'Villa premium avec piscine',
    ref: 'Réf. HA-8941',
    place: 'Abidjan, CI',
    price: '185 M FCFA',
    type: 'Vente',
    status: { tone: 'warning', label: 'En attente' },
    thumb:
      'https://storage.googleapis.com/banani-generated-images/generated-images/94b1683e-a38b-4f0a-9596-198785fc75af.jpg',
    actions: [
      { icon: Eye, className: 'text-neutral-900' },
      { icon: Check, className: 'text-emerald-600' },
    ],
  },
  {
    name: 'Appartement T4 centre-ville',
    ref: 'Réf. HA-8912',
    place: 'Dakar, SN',
    price: '72 M FCFA',
    type: 'Vente',
    status: { tone: 'success', label: 'Validée' },
    thumb:
      'https://storage.googleapis.com/banani-generated-images/generated-images/caba0b3a-e0b3-4862-824e-5e4ac1b9888c.jpg',
    actions: [
      { icon: Pencil, className: 'text-neutral-900' },
      { icon: ArrowUpRight, className: 'text-brand' },
    ],
  },
  {
    name: 'Terrain de 800 m² en périphérie',
    ref: 'Réf. HA-8864',
    place: 'Cotonou, BJ',
    price: '24 M FCFA',
    type: 'Vente',
    status: { tone: 'danger', label: 'Rejetée' },
    thumb:
      'https://storage.googleapis.com/banani-generated-images/generated-images/05725849-8cd3-4bfd-b818-fd767b0ef4ac.jpg',
    actions: [
      { icon: FileWarning, className: 'text-amber-600' },
      { icon: Trash2, className: 'text-red-500' },
    ],
  },
  {
    name: 'Plateau bureaux quartier affaires',
    ref: 'Réf. HA-8807',
    place: 'Lomé, TG',
    price: '3,8 M FCFA/mois',
    type: 'Location',
    status: { tone: 'primary', label: 'Boostée' },
    thumb:
      'https://storage.googleapis.com/banani-generated-images/generated-images/6d7fc71b-cdfc-40e3-b22a-e01a1744d201.jpg',
    actions: [
      { icon: Rocket, className: 'text-brand' },
      { icon: MoreHorizontal, className: 'text-gray-400' },
    ],
  },
];

const ACTIVITY = [
  {
    icon: Building2,
    tone: 'text-brand',
    title: 'Nouvelle annonce postée · Villa duplex à Cocody',
    sub: "Agence Babi Prestige · Abidjan, Côte d'Ivoire",
    time: 'Il y a 8 min',
  },
  {
    icon: ShieldAlert,
    tone: 'text-amber-600',
    title: 'Signalement reçu sur une annonce terrain',
    sub: 'Motif: coordonnées invalides · Cotonou, Bénin',
    time: 'Il y a 21 min',
  },
  {
    icon: CreditCard,
    tone: 'text-emerald-600',
    title: 'Paiement jetons confirmé · 420 000 FCFA',
    sub: 'Agence Horizon Immo · Mobile Money · Sénégal',
    time: 'Il y a 34 min',
  },
  {
    icon: UserRoundX,
    tone: 'text-red-500',
    title: 'Compte agence suspendu temporairement',
    sub: '3 annonces en doublon détectées · Lomé, Togo',
    time: 'Il y a 1 h',
  },
];

const ALERTS = [
  {
    icon: Clock3,
    tone: 'warning' as const,
    title: 'Annonces en attente de modération',
    sub: "Backlog à répartir entre l'équipe conformité pour maintenir un délai moyen inférieur à 2 h.",
    metric: '126',
  },
  {
    icon: Siren,
    tone: 'danger' as const,
    title: 'Comptes suspects',
    sub: 'Profils avec activité anormale, paiements incohérents ou annonces répétitives détectées.',
    metric: '18',
  },
];

const REVENUE = [
  {
    icon: Coins,
    tone: 'text-brand',
    title: 'Vente de jetons',
    sub: '42,3 M FCFA · 4 812 packs vendus',
    pct: '50%',
  },
  {
    icon: Landmark,
    tone: 'text-emerald-600',
    title: 'Commissions',
    sub: '31,9 M FCFA · ventes confirmées',
    pct: '38%',
  },
  {
    icon: Video,
    tone: 'text-amber-600',
    title: 'Visites virtuelles',
    sub: '10,5 M FCFA · prestations VR',
    pct: '12%',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  return (
    <AdminShell active="dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Vue globale · Multi-pays agrégée</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[30px]">
            Tableau de bord admin
          </h1>
          <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-gray-400">
            Suivi consolidé des annonces, revenus, modération et croissance pour le Bénin, le Togo,
            la Côte d&apos;Ivoire et le Sénégal. Mise en page aérée, premium et pensée pour une
            lecture rapide.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Rapport mensuel
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

      {/* Content grid */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {/* Left stack */}
        <div className="flex min-w-0 flex-col gap-4">
          <AdminCard
            title="Évolution des annonces publiées par pays"
            subtitle="Comparatif sur 30 jours avec focus sur la dynamique régionale."
            headerRight={
              <AdminMiniFilter>
                30 derniers jours
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              </AdminMiniFilter>
            }
          >
            <LineChart />
          </AdminCard>

          <AdminCard
            title="Répartition des annonces par type"
            subtitle="Volume et poids relatif des catégories les plus publiées."
            headerRight={
              <AdminMiniFilter>
                Toutes catégories
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              </AdminMiniFilter>
            }
          >
            <BarChart />
          </AdminCard>

          <ModerationTable />
        </div>

        {/* Right stack */}
        <div className="flex min-w-0 flex-col gap-4">
          <AdminCard
            title="Activité récente"
            subtitle="Dernières annonces, signalements et paiements observés sur la plateforme."
            headerRight={<AdminMiniFilter>En direct</AdminMiniFilter>}
          >
            <div className="flex flex-col gap-3.5">
              {ACTIVITY.map((a) => (
                <FeedRow
                  key={a.title}
                  icon={<a.icon className={cn('h-4 w-4', a.tone)} aria-hidden />}
                  title={a.title}
                  sub={a.sub}
                  trailing={a.time}
                />
              ))}
            </div>
          </AdminCard>

          <AdminCard
            title="Alertes opérationnelles"
            subtitle="Zones à traiter en priorité côté modération et sécurité."
          >
            <div className="flex flex-col gap-3">
              {ALERTS.map((al) => (
                <div
                  key={al.title}
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-3.5',
                    al.tone === 'warning' ? 'bg-amber-500/[0.12]' : 'bg-red-500/10',
                  )}
                >
                  <al.icon
                    className={cn(
                      'h-[18px] w-[18px] flex-shrink-0',
                      al.tone === 'warning' ? 'text-amber-600' : 'text-red-500',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="font-sora text-[14px] font-bold text-neutral-900">
                      {al.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-gray-700">{al.sub}</p>
                    <div className="mt-2.5 text-[24px] leading-none font-bold text-neutral-900">
                      {al.metric}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard
            title="Revenus rapides"
            subtitle="Lecture synthétique des flux du mois courant."
          >
            <div className="flex flex-col gap-3.5">
              {REVENUE.map((r) => (
                <FeedRow
                  key={r.title}
                  icon={<r.icon className={cn('h-4 w-4', r.tone)} aria-hidden />}
                  title={r.title}
                  sub={r.sub}
                  trailing={r.pct}
                />
              ))}
            </div>
          </AdminCard>
        </div>
      </section>

      {/* Tablet note (design annotation, kept from the Banani mockup) */}
      <section className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-white p-4">
        <TabletSmartphone className="h-[18px] w-[18px] flex-shrink-0 text-brand" aria-hidden />
        <div>
          <div className="font-sora text-[14px] font-bold text-neutral-900">
            Mode tablette simplifié prévu
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-400">
            Sur tablette, la structure peut passer en une seule colonne, avec sidebar condensée en
            tiroir, KPI en grille 2×2 et tableaux résumés en cartes compactes pour conserver la
            lisibilité.
          </p>
        </div>
      </section>
    </AdminShell>
  );
}

// ── Local sub-components ──────────────────────────────────────────────────────

function FeedRow({
  icon,
  title,
  sub,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  trailing: string;
}) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gray-100">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] leading-snug font-semibold text-neutral-900">{title}</div>
        <div className="mt-1 text-[12px] leading-snug text-gray-400">{sub}</div>
      </div>
      <span className="text-[11px] whitespace-nowrap text-gray-400">{trailing}</span>
    </div>
  );
}

function LineChart() {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3.5">
        {LINE_SERIES.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[12px] text-gray-700">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
      </div>
      <div className="grid h-[248px] grid-cols-[44px_minmax(0,1fr)] gap-2.5">
        <div className="flex flex-col justify-between pt-2 pb-[22px] text-right text-[11px] text-gray-400">
          {LINE_Y_TICKS.map((t) => (
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
            viewBox="0 0 760 220"
            preserveAspectRatio="none"
            role="img"
            aria-label="Courbes d'évolution des annonces publiées par pays"
          >
            {LINE_SERIES.map((s) => (
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
            {LINE_END.map((e, i) => (
              <circle key={i} cx={760} cy={e.y} r={5} fill={e.color} />
            ))}
          </svg>
          <div className="absolute right-3 bottom-0 left-3 grid grid-cols-6 text-[11px] text-gray-400">
            {LINE_X_TICKS.map((t) => (
              <span key={t} className="whitespace-nowrap">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function BarChart() {
  return (
    <div className="flex h-[228px] items-end gap-4 pt-1.5">
      {BARS.map((b) => (
        <div
          key={b.label}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2.5"
        >
          <div className="flex h-[178px] w-full max-w-[90px] items-end justify-center gap-2.5">
            <div
              className="w-7 rounded-t-lg bg-brand/10"
              style={{ height: `${b.light}px` }}
              aria-hidden
            />
            <div
              className="w-7 rounded-t-lg bg-brand"
              style={{ height: `${b.solid}px` }}
              aria-hidden
            />
          </div>
          <div className="text-[12px] font-semibold whitespace-nowrap text-gray-700">{b.label}</div>
          <div className="text-[11px] whitespace-nowrap text-gray-400">{b.meta}</div>
        </div>
      ))}
    </div>
  );
}

function ModerationTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
        <div className="font-sora text-[16px] font-bold text-neutral-900">
          Aperçu annonces à modérer
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TABLE_TABS.map((t, i) => (
            <button
              key={t}
              type="button"
              className={cn(
                'flex h-8 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                i === 0 ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[2.2fr_1.2fr_1fr_1fr_1fr_0.9fr] gap-3 bg-gray-100 px-[18px] py-3.5 text-[11px] font-bold text-gray-400">
            <div>Annonce</div>
            <div>Pays / ville</div>
            <div>Prix</div>
            <div>Type</div>
            <div>Statut</div>
            <div className="text-right">Actions</div>
          </div>
          {ROWS.map((r, i) => (
            <div
              key={r.ref}
              className={cn(
                'grid grid-cols-[2.2fr_1.2fr_1fr_1fr_1fr_0.9fr] items-center gap-3 border-t border-black/[0.08] px-[18px] py-3.5 text-[13px] text-neutral-900',
                i % 2 === 0 && 'bg-gray-100/40',
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={r.thumb}
                  alt=""
                  className="h-[42px] w-[42px] flex-shrink-0 rounded-[10px] object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-neutral-900">
                    {r.name}
                  </div>
                  <div className="truncate text-[12px] text-gray-400">{r.ref}</div>
                </div>
              </div>
              <div className="truncate">{r.place}</div>
              <div className="truncate">{r.price}</div>
              <div className="truncate">{r.type}</div>
              <div>
                <AdminStatusBadge tone={r.status.tone}>{r.status.label}</AdminStatusBadge>
              </div>
              <div className="flex items-center justify-end gap-2">
                {r.actions.map((a, j) => (
                  <span
                    key={j}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100"
                  >
                    <a.icon className={cn('h-[15px] w-[15px]', a.className)} aria-hidden />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
