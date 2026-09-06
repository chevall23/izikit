'use client';

import { useState } from 'react';
import {
  Plus,
  Globe,
  MapPin,
  Building,
  Tag,
  Coins,
  CalendarDays,
  ChevronDown,
  RotateCcw,
  Check,
  X,
  FileDown,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
  MessageCircle,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminBulkBar } from '@/components/admin/AdminBulkBar';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Gestion Annonces") ──────────────────────────────

type Status = 'En attente' | 'Validée' | 'Rejetée' | 'Boostée' | 'Expirée';
type Transaction = 'Vente' | 'Location';

const STATUS_TONE: Record<Status, AdminStatusTone> = {
  'En attente': 'warning',
  Validée: 'success',
  Rejetée: 'danger',
  Boostée: 'primary',
  Expirée: 'neutral',
};
const TXN_TONE: Record<Transaction, AdminStatusTone> = {
  Vente: 'primary',
  Location: 'violet',
};

interface Listing {
  id: string;
  name: string;
  ref: string;
  thumbUrl: string;
  city: string;
  countryCode: string;
  price: string;
  transaction: Transaction;
  status: Status;
  detail: {
    title: string;
    superficie: string;
    pieces: string;
    type: string;
    localisation: string;
    publication: string;
    vues: string;
    description: string;
    owner: { name: string; avatarUrl: string; phone: string; otherListings: number };
    history: { text: string; time: string; active?: boolean }[];
  };
}

const LISTINGS: Listing[] = [
  {
    id: 'ha-8941',
    name: 'Villa premium avec piscine',
    ref: 'Réf. HA-8941',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/96f00759-67e0-476b-be39-d147e08b315d.jpg',
    city: 'Abidjan',
    countryCode: 'CI',
    price: '185 M FCFA',
    transaction: 'Vente',
    status: 'En attente',
    detail: {
      title: 'Villa premium avec piscine — Cocody',
      superficie: '420 m²',
      pieces: '7 pièces · 5 ch.',
      type: 'Villa',
      localisation: 'Cocody, Abidjan',
      publication: '02 juil. 2025',
      vues: '1 248 vues',
      description:
        "Magnifique villa de standing située dans le quartier résidentiel de Cocody, Abidjan. La propriété dispose d'une grande piscine à débordement, d'un jardin tropical paysagé, d'un garage pour 3 véhicules et d'un espace de réception séparé. Finitions haut de gamme, sécurité 24h/24, accès contrôlé.",
      owner: {
        name: 'Agence Babi Prestige',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F6',
        phone: '+225 07 44 12 33',
        otherListings: 12,
      },
      history: [
        {
          text: 'Annonce soumise à la modération par Agence Babi Prestige',
          time: '02 juil. 2025 · 10h14',
          active: true,
        },
        { text: 'Photos mises à jour (8 photos ajoutées)', time: '02 juil. 2025 · 09h52' },
        { text: 'Prix modifié de 195 M → 185 M FCFA', time: '01 juil. 2025 · 16h30' },
        { text: 'Annonce créée en brouillon', time: '30 juin 2025 · 11h05' },
      ],
    },
  },
  {
    id: 'ha-8912',
    name: 'Appartement T4 centre-ville',
    ref: 'Réf. HA-8912',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/e54896ac-0a69-443c-8ea9-e92c9034ed11.jpg',
    city: 'Dakar',
    countryCode: 'SN',
    price: '72 M FCFA',
    transaction: 'Vente',
    status: 'Validée',
    detail: {
      title: 'Appartement T4 centre-ville — Plateau',
      superficie: '145 m²',
      pieces: '4 pièces · 3 ch.',
      type: 'Appartement',
      localisation: 'Plateau, Dakar',
      publication: '28 juin 2025',
      vues: '842 vues',
      description:
        "Appartement lumineux au 6ᵉ étage d'une résidence sécurisée du Plateau, à proximité immédiate des commerces et des administrations. Cuisine équipée, double salon, deux balcons avec vue dégagée sur la ville.",
      owner: {
        name: 'Immo Sénégal',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F7',
        phone: '+221 77 44 09 21',
        otherListings: 19,
      },
      history: [
        { text: 'Annonce validée par la modération', time: '28 juin 2025 · 14h20', active: true },
        { text: 'Annonce soumise à la modération par Immo Sénégal', time: '28 juin 2025 · 09h10' },
      ],
    },
  },
  {
    id: 'ha-8864',
    name: 'Terrain 800 m² périphérie',
    ref: 'Réf. HA-8864',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/f7016499-d2f4-4177-a1e9-ba67bfc8ab07.jpg',
    city: 'Cotonou',
    countryCode: 'BJ',
    price: '24 M FCFA',
    transaction: 'Vente',
    status: 'Rejetée',
    detail: {
      title: 'Terrain 800 m² périphérie — Cotonou',
      superficie: '800 m²',
      pieces: '—',
      type: 'Terrain',
      localisation: 'Périphérie, Cotonou',
      publication: '25 juin 2025',
      vues: '316 vues',
      description:
        "Terrain plat de 800 m² en zone périurbaine, non loti. Titre foncier en cours de régularisation — document non fourni lors de la soumission, ce qui a motivé le rejet de l'annonce.",
      owner: {
        name: 'Moussa Traoré',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F1',
        phone: '+229 97 15 06 32',
        otherListings: 3,
      },
      history: [
        {
          text: 'Annonce rejetée — titre foncier manquant',
          time: '26 juin 2025 · 11h40',
          active: true,
        },
        { text: 'Annonce soumise à la modération par Moussa Traoré', time: '25 juin 2025 · 17h05' },
      ],
    },
  },
  {
    id: 'ha-8807',
    name: 'Plateau bureaux quartier affaires',
    ref: 'Réf. HA-8807',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/98ce6984-38c6-4b19-b92d-ed0d80fd7884.jpg',
    city: 'Lomé',
    countryCode: 'TG',
    price: '3,8 M FCFA/mois',
    transaction: 'Location',
    status: 'Boostée',
    detail: {
      title: 'Plateau bureaux quartier affaires — Lomé',
      superficie: '260 m²',
      pieces: '8 bureaux',
      type: 'Bureau',
      localisation: 'Quartier affaires, Lomé',
      publication: '18 juin 2025',
      vues: '2 104 vues',
      description:
        'Plateau de bureaux modulable au cœur du quartier des affaires de Lomé. Open-space + 8 bureaux fermés, salle de réunion vitrée, fibre optique, parking privé 12 places.',
      owner: {
        name: 'Togo Business Immo',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F3',
        phone: '+228 90 11 22 45',
        otherListings: 6,
      },
      history: [
        {
          text: 'Annonce boostée jusqu’au 25 juillet 2025',
          time: '18 juin 2025 · 08h30',
          active: true,
        },
        { text: 'Annonce validée par la modération', time: '15 juin 2025 · 10h02' },
      ],
    },
  },
  {
    id: 'ha-8778',
    name: 'Duplex moderne à Cocody',
    ref: 'Réf. HA-8778',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/ba9177b7-3f83-4118-978d-7c50d19d925a.jpg',
    city: 'Abidjan',
    countryCode: 'CI',
    price: '95 M FCFA',
    transaction: 'Vente',
    status: 'Validée',
    detail: {
      title: 'Duplex moderne à Cocody',
      superficie: '210 m²',
      pieces: '5 pièces · 4 ch.',
      type: 'Duplex',
      localisation: 'Cocody, Abidjan',
      publication: '12 juin 2025',
      vues: '1 057 vues',
      description:
        "Duplex récent dans une résidence fermée de Cocody. Architecture contemporaine, terrasse privative à l'étage, cuisine américaine, place de parking couverte.",
      owner: {
        name: 'Agence Babi Prestige',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F6',
        phone: '+225 07 44 12 33',
        otherListings: 12,
      },
      history: [
        { text: 'Annonce validée par la modération', time: '12 juin 2025 · 15h48', active: true },
        {
          text: 'Annonce soumise à la modération par Agence Babi Prestige',
          time: '11 juin 2025 · 09h20',
        },
      ],
    },
  },
  {
    id: 'ha-8754',
    name: 'Studio meublé Plateau',
    ref: 'Réf. HA-8754',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/52bd4ce8-9160-4bcb-b64e-0234c6d27083.jpg',
    city: 'Dakar',
    countryCode: 'SN',
    price: '280 000 FCFA/mois',
    transaction: 'Location',
    status: 'En attente',
    detail: {
      title: 'Studio meublé Plateau — Dakar',
      superficie: '32 m²',
      pieces: 'Studio',
      type: 'Studio',
      localisation: 'Plateau, Dakar',
      publication: '01 juil. 2025',
      vues: '204 vues',
      description:
        'Studio entièrement meublé et équipé, idéal pour un jeune actif ou un expatrié. Kitchenette, salle de bain moderne, connexion fibre incluse dans le loyer.',
      owner: {
        name: 'Immo Sénégal',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F7',
        phone: '+221 77 44 09 21',
        otherListings: 19,
      },
      history: [
        {
          text: 'Annonce soumise à la modération par Immo Sénégal',
          time: '01 juil. 2025 · 08h55',
          active: true,
        },
      ],
    },
  },
  {
    id: 'ha-8733',
    name: 'Local commercial centre Cotonou',
    ref: 'Réf. HA-8733',
    thumbUrl:
      'https://storage.googleapis.com/banani-generated-images/generated-images/6916963e-c587-4f57-9c61-3325aff76b6a.jpg',
    city: 'Cotonou',
    countryCode: 'BJ',
    price: '1,2 M FCFA/mois',
    transaction: 'Location',
    status: 'Expirée',
    detail: {
      title: 'Local commercial centre Cotonou',
      superficie: '90 m²',
      pieces: 'Rez-de-chaussée',
      type: 'Local commercial',
      localisation: 'Centre-ville, Cotonou',
      publication: '02 avr. 2025',
      vues: '689 vues',
      description:
        'Local commercial en rez-de-chaussée sur artère passante du centre de Cotonou. Vitrine large, réserve à l’arrière, idéal boutique ou agence.',
      owner: {
        name: 'Moussa Traoré',
        avatarUrl:
          'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F1',
        phone: '+229 97 15 06 32',
        otherListings: 3,
      },
      history: [
        { text: 'Annonce expirée — non renouvelée', time: '02 juil. 2025 · 00h00', active: true },
        { text: 'Annonce validée par la modération', time: '02 avr. 2025 · 13h15' },
      ],
    },
  },
];

const TABS: { key: 'all' | Status; label: string; count: number }[] = [
  { key: 'all', label: 'Toutes', count: 128 },
  { key: 'En attente', label: 'En attente', count: 14 },
  { key: 'Validée', label: 'Validées', count: 98 },
  { key: 'Rejetée', label: 'Rejetées', count: 9 },
  { key: 'Expirée', label: 'Expirées', count: 7 },
];

const FILTERS = [
  { icon: Globe, label: 'Pays' },
  { icon: MapPin, label: 'Ville' },
  { icon: Building, label: 'Type de bien' },
  { icon: Tag, label: 'Transaction' },
  { icon: Coins, label: 'Prix' },
  { icon: CalendarDays, label: 'Date de publication' },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminAnnoncesPage() {
  const [tab, setTab] = useState<'all' | Status>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set(['ha-8941', 'ha-8912', 'ha-8864']));
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedListing = LISTINGS.find((l) => l.id === openId) ?? null;

  const rows = tab === 'all' ? LISTINGS : LISTINGS.filter((l) => l.status === tab);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AdminShell active="annonces">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">
            Administration · Multi-pays agrégée
          </p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Gestion des annonces
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nouvelle annonce
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap',
              tab === t.key ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-neutral-900',
            )}
          >
            {t.label}
            <span
              className={cn(
                'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                tab === t.key ? 'bg-brand text-white' : 'bg-black/[0.06] text-neutral-900',
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-3.5">
        <span className="text-[12px] font-semibold whitespace-nowrap text-gray-400">
          Filtrer par :
        </span>
        {FILTERS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            className="flex h-10 items-center gap-2 rounded-[10px] border border-black/[0.08] px-3 text-[13px] font-medium whitespace-nowrap text-neutral-900"
          >
            <Icon className="h-[13px] w-[13px] text-gray-400" aria-hidden />
            {label}
            <ChevronDown className="h-[13px] w-[13px] text-gray-400" aria-hidden />
          </button>
        ))}
        <span className="h-6 w-px bg-black/[0.08]" />
        <button
          type="button"
          className="flex h-10 items-center gap-1.5 px-1 text-[13px] font-semibold whitespace-nowrap text-gray-400"
        >
          <RotateCcw className="h-[13px] w-[13px]" aria-hidden />
          Réinitialiser
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            itemLabel="annonce"
            actions={
              <>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Valider en masse
                </button>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter en masse
                </button>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden />
                  Exporter CSV
                </button>
              </>
            }
          />
        )}

        <div className="flex items-center border-b border-black/[0.08] px-[18px] py-4">
          <span className="font-sora text-[15px] font-bold text-neutral-900">128 annonces</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {['', 'Annonce', 'Ville / Pays', 'Prix', 'Transaction', 'Statut', ''].map(
                  (h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune annonce dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((l, i) => (
                  <tr
                    key={l.id}
                    onClick={() => setOpenId(l.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      selected.has(l.id) ? 'bg-brand/5' : i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Sélectionner ${l.name}`}
                        aria-pressed={selected.has(l.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelected(l.id);
                        }}
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-[4px] border-2',
                          selected.has(l.id)
                            ? 'border-brand bg-brand'
                            : 'border-black/[0.15] bg-white',
                        )}
                      >
                        {selected.has(l.id) && (
                          <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <img
                          src={l.thumbUrl}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded-[10px] object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {l.name}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{l.ref}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {l.city}, {l.countryCode}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-bold whitespace-nowrap text-neutral-900">
                      {l.price}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={TXN_TONE[l.transaction]}>
                        {l.transaction}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[l.status]}>{l.status}</AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          aria-label={`Actions — ${l.name}`}
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
          total={tab === 'all' ? 128 : (TABS.find((t) => t.key === tab)?.count ?? rows.length)}
          itemLabel="annonces"
          perPage={10}
          pages={[1, 2, 3, '…', 13]}
          activePage={1}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={selectedListing != null}
        onClose={() => setOpenId(null)}
        title="Détail de l'annonce"
        footer={
          selectedListing && (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Valider
                </button>
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter
                </button>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Modifier
                </button>
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 text-[14px] font-semibold text-brand"
                >
                  <Rocket className="h-3.5 w-3.5" aria-hidden />
                  Booster
                </button>
                <button
                  type="button"
                  aria-label="Supprimer"
                  className="flex h-[38px] w-[46px] flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </>
          )
        }
      >
        {selectedListing && (
          <>
            <div className="flex items-start justify-between gap-3.5">
              <h2 className="font-sora text-[18px] leading-tight font-bold text-neutral-900">
                {selectedListing.detail.title}
              </h2>
              <div className="flex-shrink-0 text-right">
                <div className="text-[18px] font-bold whitespace-nowrap text-brand">
                  {selectedListing.price}
                </div>
                <div className="mt-1.5">
                  <AdminStatusBadge tone={STATUS_TONE[selectedListing.status]}>
                    {selectedListing.status}
                  </AdminStatusBadge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <InfoItem k="Superficie" v={selectedListing.detail.superficie} />
              <InfoItem k="Pièces" v={selectedListing.detail.pieces} />
              <InfoItem k="Type" v={selectedListing.detail.type} />
              <InfoItem k="Transaction" v={selectedListing.transaction} />
              <InfoItem k="Localisation" v={selectedListing.detail.localisation} />
              <InfoItem k="Publication" v={selectedListing.detail.publication} />
              <InfoItem k="Vues" v={selectedListing.detail.vues} />
              <InfoItem k="Référence" v={selectedListing.ref.replace('Réf. ', '')} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">Description</p>
              <p className="text-[13px] leading-relaxed text-gray-600">
                {selectedListing.detail.description}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">Propriétaire / Agence</p>
              <div className="flex items-center gap-3 rounded-[14px] bg-gray-50 p-3.5">
                <img
                  src={selectedListing.detail.owner.avatarUrl}
                  alt=""
                  className="h-[42px] w-[42px] flex-shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-neutral-900">
                    {selectedListing.detail.owner.name}
                  </div>
                  <div className="truncate text-[12px] text-gray-400">
                    {selectedListing.detail.owner.phone} ·{' '}
                    {selectedListing.detail.owner.otherListings} autres annonces
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Contacter"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand/10"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">
                Historique des modifications
              </p>
              <div className="flex flex-col gap-3">
                {selectedListing.detail.history.map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                        h.active ? 'bg-brand' : 'bg-gray-200',
                      )}
                    />
                    <div>
                      <div className="text-[13px] leading-snug text-gray-600">{h.text}</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">{h.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[12px] bg-red-50 p-3.5">
              <p className="mb-2 text-[12px] font-semibold text-red-500">
                Motif de rejet (optionnel)
              </p>
              <div className="truncate rounded-[10px] border border-red-200 bg-white px-3 py-2.5 text-[13px] text-gray-400">
                Indiquer la raison du rejet pour informer l&apos;annonceur…
              </div>
            </div>
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function InfoItem({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="mb-1.5 text-[11px] text-gray-400">{k}</div>
      <div className="text-[14px] font-semibold text-neutral-900">{v}</div>
    </div>
  );
}
