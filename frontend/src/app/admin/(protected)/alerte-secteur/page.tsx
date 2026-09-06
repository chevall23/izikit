'use client';

import { useState } from 'react';
import {
  Siren,
  Zap,
  BellRing,
  PauseCircle,
  Download,
  Plus,
  Globe,
  Tag,
  Activity,
  CircleDot,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  Pencil,
  MoreHorizontal,
  Home,
  MapPin,
  Banknote,
  Maximize2,
  DoorOpen,
  ShoppingBag,
  Send,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Alerte Secteur Admin") ──────────────────────────

type Status = 'Active' | 'En pause' | 'Expirée';

const STATUS_TONE: Record<Status, AdminStatusTone> = {
  Active: 'success',
  'En pause': 'warning',
  Expirée: 'neutral',
};

interface CriteriaTag {
  icon: LucideIcon;
  label: string;
}

interface MatchItem {
  title: string;
  sub: string;
  price: string;
  thumbUrl: string;
}

interface Alert {
  id: string;
  ref: string;
  ownerName: string;
  ownerAvatarUrl: string;
  countryFlag: string;
  location: string;
  propertyType: string;
  frequency: string;
  matchesLabel: string;
  status: Status;
  createdAt: string;
  detail: {
    title: string;
    ownerPhone: string;
    ownerEmail: string;
    criteria: CriteriaTag[];
    channel: string;
    targetCountry: string;
    lastMatch: string;
    matches: MatchItem[];
  };
}

const ALERTS: Alert[] = [
  {
    id: 'aminata-kone',
    ref: 'ALS-0038',
    ownerName: 'Aminata Koné',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F2',
    countryFlag: '🇨🇮',
    location: 'Cocody, Abidjan',
    propertyType: 'Villa',
    frequency: 'Immédiate',
    matchesLabel: '3 nouvelles',
    status: 'Active',
    createdAt: '5 jan. 2025',
    detail: {
      title: 'Villas à Cocody, Abidjan',
      ownerPhone: '+225 07 00 11 22',
      ownerEmail: 'aminata.kone@email.com',
      criteria: [
        { icon: Home, label: 'Villa' },
        { icon: MapPin, label: 'Cocody, Abidjan' },
        { icon: Banknote, label: '80M – 200M FCFA' },
        { icon: Maximize2, label: '200 m²+' },
        { icon: DoorOpen, label: '4+ pièces' },
        { icon: ShoppingBag, label: 'Vente' },
      ],
      channel: 'Email + SMS',
      targetCountry: "🇨🇮 Côte d'Ivoire",
      lastMatch: "Aujourd'hui, 09:14",
      matches: [
        {
          title: 'Villa duplex standing haut de gamme',
          sub: 'Cocody Riviera, Abidjan · 320 m²',
          price: '185M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/21596c91-5665-4ce8-9dc8-706c3074486c.jpg',
        },
        {
          title: 'Villa avec piscine, Angré',
          sub: 'Angré, Abidjan · 280 m²',
          price: '150M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/6b4c4ce2-28b7-447c-9f9e-a8f6a29a870d.jpg',
        },
        {
          title: 'Villa résidentielle sécurisée',
          sub: 'Cocody II Plateaux, Abidjan · 210 m²',
          price: '92M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/73a5ff8c-9fef-4abf-ae73-0e7db78f1e2e.jpg',
        },
      ],
    },
  },
  {
    id: 'kwame-asante',
    ref: 'ALS-0037',
    ownerName: 'Kwame Asante',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F5',
    countryFlag: '🇸🇳',
    location: 'Plateau, Dakar',
    propertyType: 'Appartement',
    frequency: 'Quotidienne',
    matchesLabel: '7 nouvelles',
    status: 'Active',
    createdAt: '12 jan. 2025',
    detail: {
      title: 'Appartements au Plateau, Dakar',
      ownerPhone: '+221 77 30 44 12',
      ownerEmail: 'kwame.asante@email.com',
      criteria: [
        { icon: Home, label: 'Appartement' },
        { icon: MapPin, label: 'Plateau, Dakar' },
        { icon: Banknote, label: '40M – 90M FCFA' },
        { icon: DoorOpen, label: '3+ pièces' },
        { icon: ShoppingBag, label: 'Vente' },
      ],
      channel: 'Email',
      targetCountry: '🇸🇳 Sénégal',
      lastMatch: 'Hier, 18h02',
      matches: [
        {
          title: 'Appartement T3 vue mer',
          sub: 'Plateau, Dakar · 98 m²',
          price: '68M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/e54896ac-0a69-443c-8ea9-e92c9034ed11.jpg',
        },
      ],
    },
  },
  {
    id: 'fatou-diallo',
    ref: 'ALS-0036',
    ownerName: 'Fatou Diallo',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F1',
    countryFlag: '🇧🇯',
    location: 'Akpakpa, Cotonou',
    propertyType: 'Terrain',
    frequency: 'Hebdomadaire',
    matchesLabel: '2 nouvelles',
    status: 'En pause',
    createdAt: '20 jan. 2025',
    detail: {
      title: 'Terrains à Akpakpa, Cotonou',
      ownerPhone: '+229 96 22 18 40',
      ownerEmail: 'fatou.diallo@email.com',
      criteria: [
        { icon: Home, label: 'Terrain' },
        { icon: MapPin, label: 'Akpakpa, Cotonou' },
        { icon: Banknote, label: '10M – 30M FCFA' },
        { icon: Maximize2, label: '400 m²+' },
        { icon: ShoppingBag, label: 'Vente' },
      ],
      channel: 'SMS',
      targetCountry: '🇧🇯 Bénin',
      lastMatch: 'Il y a 6 jours',
      matches: [
        {
          title: 'Terrain 500 m² viabilisé',
          sub: 'Akpakpa, Cotonou',
          price: '18M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/f7016499-d2f4-4177-a1e9-ba67bfc8ab07.jpg',
        },
      ],
    },
  },
  {
    id: 'yao-mensah',
    ref: 'ALS-0035',
    ownerName: 'Yao Mensah',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F18-25%2FAfrican%2F3',
    countryFlag: '🇹🇬',
    location: 'Bè, Lomé',
    propertyType: 'Bureau',
    frequency: 'Immédiate',
    matchesLabel: '1 nouvelle',
    status: 'Active',
    createdAt: '3 fév. 2025',
    detail: {
      title: 'Bureaux à Bè, Lomé',
      ownerPhone: '+228 91 05 33 27',
      ownerEmail: 'yao.mensah@email.com',
      criteria: [
        { icon: Home, label: 'Bureau' },
        { icon: MapPin, label: 'Bè, Lomé' },
        { icon: Banknote, label: '2M – 5M FCFA/mois' },
        { icon: ShoppingBag, label: 'Location' },
      ],
      channel: 'Email + SMS',
      targetCountry: '🇹🇬 Togo',
      lastMatch: "Aujourd'hui, 07h40",
      matches: [
        {
          title: 'Plateau bureaux quartier affaires',
          sub: 'Bè, Lomé · 260 m²',
          price: '3,8M FCFA/mois',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/98ce6984-38c6-4b19-b92d-ed0d80fd7884.jpg',
        },
      ],
    },
  },
  {
    id: 'nadia-toure',
    ref: 'ALS-0034',
    ownerName: 'Nadia Touré',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F7',
    countryFlag: '🇨🇮',
    location: 'Marcory, Abidjan',
    propertyType: 'Maison',
    frequency: 'Quotidienne',
    matchesLabel: '0 nouvelle',
    status: 'Expirée',
    createdAt: '15 fév. 2025',
    detail: {
      title: 'Maisons à Marcory, Abidjan',
      ownerPhone: '+225 05 18 40 09',
      ownerEmail: 'nadia.toure@email.com',
      criteria: [
        { icon: Home, label: 'Maison' },
        { icon: MapPin, label: 'Marcory, Abidjan' },
        { icon: Banknote, label: '50M – 120M FCFA' },
        { icon: ShoppingBag, label: 'Vente' },
      ],
      channel: 'Email',
      targetCountry: "🇨🇮 Côte d'Ivoire",
      lastMatch: 'Il y a 3 semaines',
      matches: [],
    },
  },
  {
    id: 'ibrahim-sow',
    ref: 'ALS-0033',
    ownerName: 'Ibrahim Sow',
    ownerAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F7',
    countryFlag: '🇸🇳',
    location: 'Almadies, Dakar',
    propertyType: 'Villa',
    frequency: 'Hebdomadaire',
    matchesLabel: '5 nouvelles',
    status: 'Active',
    createdAt: '22 fév. 2025',
    detail: {
      title: 'Villas aux Almadies, Dakar',
      ownerPhone: '+221 78 40 15 63',
      ownerEmail: 'ibrahim.sow@email.com',
      criteria: [
        { icon: Home, label: 'Villa' },
        { icon: MapPin, label: 'Almadies, Dakar' },
        { icon: Banknote, label: '150M – 350M FCFA' },
        { icon: Maximize2, label: '300 m²+' },
        { icon: ShoppingBag, label: 'Vente' },
      ],
      channel: 'Email + SMS',
      targetCountry: '🇸🇳 Sénégal',
      lastMatch: 'Il y a 2 jours',
      matches: [
        {
          title: 'Villa contemporaine face mer',
          sub: 'Almadies, Dakar · 340 m²',
          price: '295M FCFA',
          thumbUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/ba9177b7-3f83-4118-978d-7c50d19d925a.jpg',
        },
      ],
    },
  },
];

const TABS: { key: 'all' | Status; label: string; count: number }[] = [
  { key: 'all', label: 'Toutes', count: 38 },
  { key: 'Active', label: 'Actives', count: 24 },
  { key: 'En pause', label: 'En pause', count: 6 },
  { key: 'Expirée', label: 'Expirées', count: 8 },
];

const FILTERS = [
  { icon: Globe, label: 'Pays' },
  { icon: Tag, label: 'Type de bien' },
  { icon: Activity, label: 'Fréquence' },
  { icon: CircleDot, label: 'Statut' },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminAlerteSecteurPage() {
  const [tab, setTab] = useState<'all' | Status>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedAlert = ALERTS.find((a) => a.id === openId) ?? null;

  const rows = tab === 'all' ? ALERTS : ALERTS.filter((a) => a.status === tab);

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
            Gestion de toutes les alertes sectorielles créées par les utilisateurs. Correspondances
            en temps réel et notifications automatiques.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex h-[38px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter
          </button>
          <button
            type="button"
            className="flex h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
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
          delta="+6 ce mois"
          deltaTone="up"
          value="38"
          label="Alertes totales"
          footLeft="Tous statuts"
          footRight=""
        />
        <AdminKpiCard
          icon={<Zap className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="+2 aujourd'hui"
          deltaTone="up"
          value="24"
          label="Alertes actives"
          footLeft="En surveillance"
          footRight=""
        />
        <AdminKpiCard
          icon={<BellRing className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="6 non envoyées"
          deltaTone="warn"
          value="143"
          label="Correspondances envoyées"
          footLeft="Ce mois"
          footRight=""
        />
        <AdminKpiCard
          icon={<PauseCircle className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Stable"
          deltaTone="neutral"
          value="8"
          label="En pause / Expirées"
          footLeft="Sur les 30 derniers jours"
          footRight=""
        />
      </section>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
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
                  onClick={() => setTab(t.key)}
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
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-neutral-900"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filtres
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] px-[18px] py-3.5">
          <span className="flex h-[34px] min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] text-gray-400">
            Rechercher par nom, secteur, réf…
          </span>
          {FILTERS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className="flex h-[34px] items-center gap-1.5 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] font-medium whitespace-nowrap text-neutral-900"
            >
              <Icon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {label}
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {[
                  '',
                  'Propriétaire',
                  'Pays / Ville',
                  'Type de bien',
                  'Fréquence',
                  'Correspondances',
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune alerte dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((a, i) => (
                  <tr
                    key={a.id}
                    onClick={() => setOpenId(a.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className="block h-4 w-4 rounded-[4px] border-2 border-black/[0.15]" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <img
                          src={a.ownerAvatarUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {a.ownerName}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{a.ref}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {a.countryFlag} {a.location}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {a.propertyType}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {a.frequency}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex h-[24px] items-center whitespace-nowrap rounded-full bg-brand/10 px-2.5 text-[11px] font-bold text-brand">
                        {a.matchesLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[a.status]}>{a.status}</AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {a.createdAt}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${a.ownerName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(a.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Eye className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Modifier — ${a.ownerName}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Pencil className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions — ${a.ownerName}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
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
          from={1}
          to={rows.length}
          total={tab === 'all' ? 38 : (TABS.find((t) => t.key === tab)?.count ?? rows.length)}
          itemLabel="alertes"
          perPage={6}
          pages={[1, 2, 3, '…', 7]}
          activePage={1}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={selectedAlert != null}
        onClose={() => setOpenId(null)}
        title={selectedAlert?.detail.title ?? ''}
        titleExtra={
          selectedAlert && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {selectedAlert.ref} · Alerte {selectedAlert.status.toLowerCase()}
            </span>
          )
        }
        footer={
          selectedAlert && (
            <>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Envoyer les correspondances
              </button>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-amber-50 text-[14px] font-semibold text-amber-600"
              >
                <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                Mettre en pause
              </button>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer l&apos;alerte
              </button>
            </>
          )
        }
      >
        {selectedAlert && (
          <>
            <div className="flex items-center gap-3">
              <img
                src={selectedAlert.ownerAvatarUrl}
                alt=""
                className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-neutral-900">
                  {selectedAlert.ownerName}
                </div>
                <div className="truncate text-[12px] text-gray-400">
                  {selectedAlert.detail.ownerPhone} · {selectedAlert.detail.ownerEmail}
                </div>
              </div>
              <AdminStatusBadge tone={STATUS_TONE[selectedAlert.status]}>
                {selectedAlert.status}
              </AdminStatusBadge>
            </div>

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Critères de l&apos;alerte
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedAlert.detail.criteria.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
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
                <DrawerRow k="Fréquence" v={selectedAlert.frequency} />
                <DrawerRow k="Canal de notification" v={selectedAlert.detail.channel} />
                <DrawerRow k="Pays cible" v={selectedAlert.detail.targetCountry} />
                <DrawerRow k="Créée le" v={selectedAlert.createdAt} />
                <DrawerRow k="Dernière correspondance" v={selectedAlert.detail.lastMatch} />
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">
                Dernières correspondances ({selectedAlert.detail.matches.length})
              </p>
              {selectedAlert.detail.matches.length === 0 ? (
                <p className="text-[13px] text-gray-400">
                  Aucune correspondance pour l&apos;instant.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {selectedAlert.detail.matches.map((m) => (
                    <div
                      key={m.title}
                      className="flex items-center gap-2.5 rounded-lg border border-black/[0.08] p-2.5"
                    >
                      <img
                        src={m.thumbUrl}
                        alt=""
                        className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">
                          {m.title}
                        </div>
                        <div className="truncate text-[12px] text-gray-400">{m.sub}</div>
                      </div>
                      <span className="flex-shrink-0 text-[13px] font-bold whitespace-nowrap text-brand">
                        {m.price}
                      </span>
                    </div>
                  ))}
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
