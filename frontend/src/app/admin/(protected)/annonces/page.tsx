'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCursorPager } from './use-cursor-pager';

// ── API shapes (GET /api/admin/listings, /api/admin/listings/[id]) ─────────────

type TabKey = 'all' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SOLD';

interface ListRow {
  id: string;
  title: string;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  status: string;
  viewCount: number;
  createdAt: string;
  owner: { id: string; name: string | null } | null;
  thumbnailUrl: string | null;
}

interface Counts {
  all: number;
  pending: number;
  verified: number;
  rejected: number;
  sold: number;
}

interface ListingDetail {
  id: string;
  title: string;
  description: string | null;
  landmark: string | null;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  status: string;
  surfaceM2: number | null;
  capacity: number | null;
  yearBuilt: number | null;
  standing: string | null;
  roomsTotal: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  kitchens: number | null;
  amenities: string[];
  viewCount: number;
  rejectionReason: string | null;
  rejectedAt: string | null;
  moderatedAt: string | null;
  moderatedBy: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    listingCount: number;
  };
  photos: { id: string; url: string; key: string; isPrimary: boolean; position: number }[];
  documents: { id: string; type: string; status: string; url: string; filename: string }[];
  inquiryCount: number;
  reportCount: number;
}

// ── Display maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  VERIFIED: 'Validée',
  REJECTED: 'Rejetée',
  SOLD: 'Vendue',
  DRAFT: 'Brouillon',
};
const STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SOLD: 'neutral',
  DRAFT: 'neutral',
};
const TXN_LABEL: Record<string, string> = {
  VENTE: 'Vente',
  LOCATION: 'Location',
  SEJOUR: 'Séjour',
  AUBERGE: 'Auberge',
};
const TXN_TONE: Record<string, AdminStatusTone> = {
  VENTE: 'primary',
  LOCATION: 'violet',
  SEJOUR: 'primary',
  AUBERGE: 'violet',
};
const PROPERTY_LABEL: Record<string, string> = {
  VILLA: 'Villa',
  APPARTEMENT: 'Appartement',
  PARCELLE: 'Parcelle',
  DOMAINE: 'Domaine',
  MAISON: 'Maison',
  BOUTIQUE: 'Boutique',
  BUREAU: 'Bureau',
  SALLE_FETE: 'Salle de fête',
  SALLE_CONFERENCE: 'Salle de conférence',
  IMMEUBLE: 'Immeuble',
};
const STANDING_LABEL: Record<string, string> = {
  BASIC: 'Standard',
  MID: 'Bon standing',
  HIGH: 'Haut standing',
};

function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
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
function shortRef(id: string): string {
  return `Réf. ${id.slice(-6).toUpperCase()}`;
}
function initials(name: string | null, fallback: string): string {
  const src = (name ?? fallback).trim();
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'VERIFIED', label: 'Validées' },
  { key: 'REJECTED', label: 'Rejetées' },
  { key: 'SOLD', label: 'Vendues' },
];

const FILTERS = [
  { icon: Globe, label: 'Pays' },
  { icon: MapPin, label: 'Ville' },
  { icon: Building, label: 'Type de bien' },
  { icon: Tag, label: 'Transaction' },
  { icon: Coins, label: 'Prix' },
  { icon: CalendarDays, label: 'Date de publication' },
];

const PER_PAGE = 20;
const EMPTY_COUNTS: Counts = { all: 0, pending: 0, verified: 0, rejected: 0, sold: 0 };

function countFor(counts: Counts, key: TabKey): number {
  return key === 'all' ? counts.all : counts[key.toLowerCase() as keyof Counts];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAnnoncesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const statusParam = tab === 'all' ? '' : `&status=${tab}`;

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = `?limit=${PER_PAGE}${statusParam}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await api<{ items: ListRow[]; nextCursor: string | null; counts: Counts }>(
        `/api/admin/listings${qs}`,
      );
      setCounts(res.counts);
      return { items: res.items, nextCursor: res.nextCursor };
    },
    [statusParam],
  );

  const total = countFor(counts, tab);
  const pager = useCursorPager<ListRow>({ perPage: PER_PAGE, total, fetchPage, resetKey: tab });

  useEffect(() => {
    if (pager.error) toast('Impossible de charger les annonces.', 'error');
  }, [pager.error, toast]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    api<{ listing: ListingDetail }>(`/api/admin/listings/${openId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.listing);
      })
      .catch(() => {
        if (cancelled) return;
        toast("Impossible de charger le détail de l'annonce.", 'error');
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
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = pager.items;

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
            className="flex h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground opacity-60"
            title="Bientôt disponible"
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
            onClick={() => switchTab(t.key)}
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
              {countFor(counts, t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar — inert (étape suivante) */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-3.5 opacity-60">
        <span className="text-[12px] font-semibold whitespace-nowrap text-gray-400">
          Filtrer par :
        </span>
        {FILTERS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex h-10 items-center gap-2 rounded-[10px] border border-black/[0.08] px-3 text-[13px] font-medium whitespace-nowrap text-neutral-900"
          >
            <Icon className="h-[13px] w-[13px] text-gray-400" aria-hidden />
            {label}
            <ChevronDown className="h-[13px] w-[13px] text-gray-400" aria-hidden />
          </span>
        ))}
        <span className="h-6 w-px bg-black/[0.08]" />
        <span className="flex h-10 items-center gap-1.5 px-1 text-[13px] font-semibold whitespace-nowrap text-gray-400">
          <RotateCcw className="h-[13px] w-[13px]" aria-hidden />
          Réinitialiser
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            itemLabel="annonce"
            actions={
              <>
                <span className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600 opacity-60">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Valider en masse
                </span>
                <span className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500 opacity-60">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter en masse
                </span>
                <span className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900 opacity-60">
                  <FileDown className="h-3.5 w-3.5" aria-hidden />
                  Exporter CSV
                </span>
              </>
            }
          />
        )}

        <div className="flex items-center border-b border-black/[0.08] px-[18px] py-4">
          <span className="font-sora text-[15px] font-bold text-neutral-900">
            {total} annonce{total > 1 ? 's' : ''}
          </span>
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
              {pager.loading ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
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
                        aria-label={`Sélectionner ${l.title}`}
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
                        {l.thumbnailUrl ? (
                          <img
                            src={l.thumbnailUrl}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded-[10px] object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-300">
                            <Building className="h-4 w-4" aria-hidden />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {l.title || 'Sans titre'}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{shortRef(l.id)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {l.city}, {l.country}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-bold whitespace-nowrap text-neutral-900">
                      {formatPrice(l.price, l.currency)}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={TXN_TONE[l.transactionType] ?? 'neutral'}>
                        {labelOr(TXN_LABEL, l.transactionType)}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[l.status] ?? 'neutral'}>
                        {labelOr(STATUS_LABEL, l.status)}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          aria-label={`Actions — ${l.title}`}
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
          itemLabel="annonces"
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
        title="Détail de l'annonce"
        footer={
          detail && (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground opacity-50"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Valider
                </button>
                <button
                  type="button"
                  disabled
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter
                </button>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900 opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Modifier
                </button>
                <button
                  type="button"
                  disabled
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 text-[14px] font-semibold text-brand opacity-50"
                >
                  <Rocket className="h-3.5 w-3.5" aria-hidden />
                  Booster
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Supprimer"
                  className="flex h-[38px] w-[46px] flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
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
            <div className="flex items-start justify-between gap-3.5">
              <h2 className="font-sora text-[18px] leading-tight font-bold text-neutral-900">
                {detail.title || 'Sans titre'}
              </h2>
              <div className="flex-shrink-0 text-right">
                <div className="text-[18px] font-bold whitespace-nowrap text-brand">
                  {formatPrice(detail.price, detail.currency)}
                </div>
                <div className="mt-1.5">
                  <AdminStatusBadge tone={STATUS_TONE[detail.status] ?? 'neutral'}>
                    {labelOr(STATUS_LABEL, detail.status)}
                  </AdminStatusBadge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <InfoItem k="Superficie" v={detail.surfaceM2 ? `${detail.surfaceM2} m²` : '—'} />
              <InfoItem
                k="Pièces"
                v={
                  detail.roomsTotal
                    ? `${detail.roomsTotal} pièce${detail.roomsTotal > 1 ? 's' : ''}${
                        detail.bedrooms ? ` · ${detail.bedrooms} ch.` : ''
                      }`
                    : '—'
                }
              />
              <InfoItem k="Type" v={labelOr(PROPERTY_LABEL, detail.propertyType)} />
              <InfoItem k="Transaction" v={labelOr(TXN_LABEL, detail.transactionType)} />
              <InfoItem
                k="Localisation"
                v={`${detail.city}, ${detail.country}${detail.landmark ? ` — ${detail.landmark}` : ''}`}
              />
              <InfoItem k="Publication" v={formatDate(detail.createdAt)} />
              <InfoItem k="Vues" v={`${detail.viewCount} vue${detail.viewCount > 1 ? 's' : ''}`} />
              <InfoItem
                k="Standing"
                v={detail.standing ? labelOr(STANDING_LABEL, detail.standing) : '—'}
              />
              <InfoItem k="Demandes reçues" v={String(detail.inquiryCount)} />
              <InfoItem k="Signalements" v={String(detail.reportCount)} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">Description</p>
              <p className="text-[13px] leading-relaxed text-gray-600">
                {detail.description || 'Aucune description fournie.'}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">Propriétaire / Agence</p>
              <div className="flex items-center gap-3 rounded-[14px] bg-gray-50 p-3.5">
                <div className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[13px] font-bold text-brand">
                  {initials(detail.owner.name, detail.owner.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-neutral-900">
                    {detail.owner.name || detail.owner.email}
                  </div>
                  <div className="truncate text-[12px] text-gray-400">
                    {detail.owner.phone ? `${detail.owner.phone} · ` : ''}
                    {detail.owner.listingCount} annonce{detail.owner.listingCount > 1 ? 's' : ''} au
                    total
                  </div>
                </div>
                <span
                  aria-hidden
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand/10 opacity-60"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-brand" />
                </span>
              </div>
            </div>

            {detail.status === 'REJECTED' && (
              <div className="rounded-[12px] bg-red-50 p-3.5">
                <p className="mb-2 text-[12px] font-semibold text-red-500">Motif de rejet</p>
                <p className="rounded-[10px] border border-red-200 bg-white px-3 py-2.5 text-[13px] text-gray-600">
                  {detail.rejectionReason || 'Aucun motif enregistré.'}
                </p>
                {detail.rejectedAt && (
                  <p className="mt-1.5 text-[11px] text-red-400">
                    Rejetée le {formatDate(detail.rejectedAt)}
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="mb-2 text-[13px] font-bold text-neutral-900">
                Historique des modifications
              </p>
              <p className="text-[13px] text-gray-400">
                L&apos;historique détaillé sera disponible dans une prochaine étape.
              </p>
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
