'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  BadgeCheck,
  Bath,
  BedDouble,
  Calendar,
  Car,
  ChevronDown,
  Droplets,
  Eye,
  FileText,
  Flag,
  Grid2x2,
  Heart,
  Image as ImageIcon,
  Info,
  LayoutList,
  Loader2,
  Map,
  MapPin,
  MessageCircle,
  MessageSquare,
  Move,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  TreePine,
  Utensils,
  Video,
  Waves,
  Wifi,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { InitialsAvatar } from '@/components/dashboard/InitialsAvatar';
import {
  PROPERTY_TYPE_LABEL,
  TRANSACTION_TYPE_LABEL,
  STANDING_LABEL,
  AMENITY_LABEL,
  formatListingPrice,
  cloudinaryOptimize,
} from '@/lib/listings';
import { COUNTRY_FLAG, formatDate } from '@/lib/alerts';

interface PublicListingDetail {
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
  createdAt: string;
  photos: { url: string; isPrimary: boolean }[];
  agent: { name: string | null; avatarUrl: string | null; phone: string | null; seed: string };
  location: { lat: number; lon: number } | null;
  similar: SimilarListing[];
}

interface SimilarListing {
  id: string;
  title: string;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  createdAt: string;
  primaryPhotoUrl: string | null;
  photoCount: number;
  agent: { name: string | null; avatarUrl: string | null; seed: string };
}

const AMENITY_ICON: Record<string, typeof Waves> = {
  POOL: Waves,
  PARKING: Car,
  AC: Wind,
  GARDEN: TreePine,
  GENERATOR: Zap,
  RUNNING_WATER: Droplets,
  SECURITY: ShieldCheck,
  TERRACE: Sun,
  FIBER: Wifi,
  ELEVATOR: Move,
  INTERCOM: Phone,
  FITTED_KITCHEN: Utensils,
};

function buildWhatsappLink(phone: string, title: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const text = encodeURIComponent(
    `Bonjour, je suis intéressé(e) par l'annonce "${title}" sur Habitat-Afrik.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

const REPORT_REASON_LABEL: Record<string, string> = {
  FAKE: 'Annonce factice',
  SOLD: 'Déjà vendu / loué',
  INCORRECT_INFO: 'Informations incorrectes',
  SCAM: 'Arnaque suspectée',
  OTHER: 'Autre',
};

function InertRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div title="Bientôt disponible" className={cn('cursor-not-allowed select-none', className)}>
      {children}
    </div>
  );
}

export default function AnnonceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [inquiryType, setInquiryType] = useState<'MESSAGE' | 'VR_VISIT'>('MESSAGE');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('Bonjour, je suis intéressé par cette annonce...');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('FAKE');
  const [reportDetail, setReportDetail] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<PublicListingDetail>(`/api/public/listings/${id}`)
      .then((res) => {
        if (cancelled) return;
        setListing(res);
        setHeroIdx(0);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxOpen]);

  async function submitInquiry(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendError('');
    try {
      await api(`/api/public/listings/${id}/inquiries`, {
        method: 'POST',
        body: { type: inquiryType, name, phone, message },
      });
      setSent(true);
    } catch (err) {
      setSendError(
        err instanceof ApiError && err.status === 429
          ? 'Trop de demandes envoyées. Réessayez plus tard.'
          : "Échec de l'envoi. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  async function submitReport() {
    setReportSending(true);
    try {
      await api(`/api/public/listings/${id}/reports`, {
        method: 'POST',
        body: { reason: reportReason, detail: reportDetail || undefined },
      });
      setReportSent(true);
    } catch {
      // best-effort — the reason select stays open so the visitor can retry
    } finally {
      setReportSending(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="bg-[#F5F6F8] text-[#1A1A1A]">
        <PublicNavbar active="annonces" />
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" aria-hidden />
          <p className="text-xs text-gray-400">Chargement de l&apos;annonce…</p>
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="bg-[#F5F6F8] text-[#1A1A1A]">
        <PublicNavbar active="annonces" />
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm font-medium text-neutral-700">Cette annonce est introuvable.</p>
          <Link href="/annonces" className="text-sm font-semibold text-brand">
            Retour aux annonces
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const FEATURES: { icon: typeof BedDouble; val: string | number; label: string }[] = [
    ...(listing.bedrooms !== null
      ? [{ icon: BedDouble, val: listing.bedrooms, label: 'Chambres' }]
      : []),
    ...(listing.bathrooms !== null
      ? [{ icon: Bath, val: listing.bathrooms, label: 'Salles de bain' }]
      : []),
    ...(listing.surfaceM2 !== null
      ? [{ icon: Move, val: `${listing.surfaceM2} m²`, label: 'Surface' }]
      : []),
    ...(listing.roomsTotal !== null
      ? [{ icon: LayoutList, val: listing.roomsTotal, label: 'Pièces' }]
      : []),
    ...(listing.kitchens !== null
      ? [{ icon: Utensils, val: listing.kitchens, label: 'Cuisines' }]
      : []),
    ...(listing.capacity !== null
      ? [{ icon: Grid2x2, val: listing.capacity, label: 'Capacité' }]
      : []),
    ...(listing.yearBuilt !== null
      ? [{ icon: Calendar, val: listing.yearBuilt, label: 'Année' }]
      : []),
    ...(listing.standing !== null
      ? [
          {
            icon: Sparkles,
            val: STANDING_LABEL[listing.standing] ?? listing.standing,
            label: 'Standing',
          },
        ]
      : []),
  ];

  const photos = listing.photos;
  const heroPhoto = photos[heroIdx] ?? photos[0];
  const stripThumbs = photos.slice(0, 4);
  const extraCount = photos.length - stripThumbs.length;

  return (
    <div className="bg-[#F5F6F8] text-[#1A1A1A]">
      <PublicNavbar active="annonces" />

      {/* BREADCRUMB */}
      <div className="border-b border-black/[0.06] bg-white py-3.5">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 px-4 text-[13px] text-gray-500 lg:px-7">
          <Link href="/" className="text-gray-500">
            Accueil
          </Link>
          <span className="text-gray-300">/</span>
          <Link href="/annonces" className="text-gray-500">
            Annonces
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-neutral-900">{listing.title}</span>
        </div>
      </div>

      {/* GALLERY */}
      <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-7">
        <div className="rounded-2xl bg-white p-2.5 ring-1 ring-black/[0.05]">
          {/* HERO */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-gray-100">
            {heroPhoto ? (
              <img
                src={cloudinaryOptimize(heroPhoto.url, 1400)}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-100">
                <ImageIcon className="h-10 w-10 text-slate-300" aria-hidden />
              </div>
            )}
            <span className="absolute top-4 left-4 z-[2] inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-[6px] text-xs font-bold whitespace-nowrap text-white shadow-sm">
              <BadgeCheck className="h-[13px] w-[13px]" aria-hidden />
              Vérifié
            </span>
            <div className="absolute top-4 right-4 z-[2] flex gap-2">
              <button
                type="button"
                onClick={() => setSaved((s) => !s)}
                className="flex items-center gap-1.5 rounded-full bg-white/92 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-neutral-900"
              >
                <Heart
                  className={cn(
                    'h-3.5 w-3.5',
                    saved ? 'fill-red-500 text-red-500' : 'text-red-500',
                  )}
                  aria-hidden
                />
                {saved ? 'Sauvegardé' : 'Sauvegarder'}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-1.5 rounded-full bg-white/92 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-neutral-900"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                {shared ? 'Lien copié !' : 'Partager'}
              </button>
            </div>
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute right-3.5 bottom-3.5 z-[2] inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-[6px] text-xs font-semibold whitespace-nowrap text-white"
              >
                <ImageIcon className="h-[13px] w-[13px]" aria-hidden />
                {photos.length} photos
              </button>
            )}
          </div>

          {/* THUMBNAIL STRIP */}
          {photos.length > 1 && (
            <div className="mt-2.5 grid grid-cols-4 gap-2.5">
              {stripThumbs.map((p, i) => {
                const showOverlay = i === stripThumbs.length - 1 && extraCount > 0;
                const isActive = !showOverlay && i === heroIdx;
                return (
                  <button
                    key={`${p.url}-${i}`}
                    type="button"
                    onClick={() => (showOverlay ? setLightboxOpen(true) : setHeroIdx(i))}
                    aria-label={
                      showOverlay
                        ? `Voir les ${photos.length} photos`
                        : `Afficher la photo ${i + 1}`
                    }
                    className={cn(
                      'relative aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-black/[0.06] transition',
                      isActive && 'ring-2 ring-brand',
                    )}
                  >
                    <img
                      src={cloudinaryOptimize(p.url, 400)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {showOverlay && (
                      <span className="absolute inset-0 grid place-items-center bg-black/55 text-lg font-extrabold text-white">
                        +{extraCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* DETAIL CONTENT */}
      <div className="mx-auto max-w-[1280px] px-4 py-9 pb-[72px] lg:px-7">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* MAIN */}
          <div className="min-w-0">
            {/* TITLE BLOCK */}
            <div className="mb-4 rounded-2xl bg-white p-7">
              <div className="mb-4 flex flex-col-reverse items-start justify-between gap-5 sm:flex-row">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold whitespace-nowrap text-brand">
                    {PROPERTY_TYPE_LABEL[listing.propertyType] ?? listing.propertyType} ·{' '}
                    {TRANSACTION_TYPE_LABEL[listing.transactionType] ?? listing.transactionType}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold whitespace-nowrap text-emerald-600">
                    <BadgeCheck className="h-[11px] w-[11px]" aria-hidden />
                    Annonce vérifiée
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold whitespace-nowrap text-gray-500">
                    Réf. {listing.id.slice(-8).toUpperCase()}
                  </span>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[26px] font-extrabold whitespace-nowrap text-brand lg:text-[30px]">
                    {formatListingPrice(listing.price, listing.currency)}
                  </div>
                </div>
              </div>
              <h1 className="font-sora mb-3 text-2xl font-extrabold tracking-[-0.03em] lg:text-[26px]">
                {listing.title}
              </h1>
              <div className="mb-4.5 flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin className="h-[15px] w-[15px] flex-shrink-0 text-brand" aria-hidden />
                {listing.city}
                {listing.landmark ? ` — ${listing.landmark}` : ''} ·{' '}
                {COUNTRY_FLAG[listing.country] ?? ''} {listing.country}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[0.06] pt-3.5">
                <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-gray-500">
                  <Eye className="h-[13px] w-[13px]" aria-hidden />
                  {listing.viewCount} vue{listing.viewCount === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-gray-500">
                  <Calendar className="h-[13px] w-[13px]" aria-hidden />
                  Publié le {formatDate(listing.createdAt)}
                </span>
              </div>
            </div>

            {/* CARACTERISTIQUES */}
            {FEATURES.length > 0 && (
              <div className="mb-4 rounded-2xl bg-white p-7">
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <LayoutList className="h-[17px] w-[17px] text-brand" aria-hidden />
                  Caractéristiques
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {FEATURES.map((f) => (
                    <div
                      key={f.label}
                      className="flex flex-col items-center gap-1.5 rounded-[14px] bg-gray-50 px-2.5 py-4 text-center"
                    >
                      <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-brand/10">
                        <f.icon className="h-[18px] w-[18px] text-brand" aria-hidden />
                      </div>
                      <div className="text-base font-bold">{f.val}</div>
                      <div className="text-[11px] leading-tight text-gray-500">{f.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EQUIPEMENTS */}
            {listing.amenities.length > 0 && (
              <div className="mb-4 rounded-2xl bg-white p-7">
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <Wrench className="h-[17px] w-[17px] text-brand" aria-hidden />
                  Équipements &amp; prestations
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {listing.amenities.map((key) => {
                    const Icon = AMENITY_ICON[key] ?? Sparkles;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2.5 rounded-[10px] bg-gray-50 px-3.5 py-2.5 text-[13px]"
                      >
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
                          <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />
                        </div>
                        {AMENITY_LABEL[key] ?? key}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DESCRIPTION */}
            {listing.description && (
              <div className="mb-4 rounded-2xl bg-white p-7">
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <FileText className="h-[17px] w-[17px] text-brand" aria-hidden />
                  Description
                </div>
                <p
                  className={cn(
                    'text-sm leading-[1.75] whitespace-pre-line',
                    !descExpanded && 'line-clamp-4',
                  )}
                >
                  {listing.description}
                </p>
                {listing.description.length > 240 && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
                  >
                    {descExpanded ? 'Voir moins' : 'Lire la suite'}
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        descExpanded && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                )}
              </div>
            )}

            {/* LOCALISATION */}
            {listing.location && (
              <div className="mb-4 rounded-2xl bg-white p-7">
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <Map className="h-[17px] w-[17px] text-brand" aria-hidden />
                  Localisation
                </div>
                <div className="overflow-hidden rounded-[14px]">
                  <iframe
                    title="Localisation"
                    className="h-[280px] w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${listing.location.lat},${listing.location.lon}&z=14&output=embed`}
                  />
                </div>
                <div className="mt-3 flex items-start gap-1.5 text-[13px] text-gray-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" aria-hidden />
                  {listing.city}, {listing.country} — Adresse exacte communiquée après contact avec
                  l&apos;agent
                </div>
              </div>
            )}

            {/* ANNONCES SIMILAIRES */}
            {listing.similar.length > 0 && (
              <div className="rounded-2xl bg-white p-7">
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <Grid2x2 className="h-[17px] w-[17px] text-brand" aria-hidden />
                  Annonces similaires
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {listing.similar.map((s) => (
                    <Link
                      key={s.id}
                      href={`/annonces/${s.id}`}
                      className="overflow-hidden rounded-[14px] border border-black/[0.06]"
                    >
                      <div className="relative h-[148px] bg-gray-100">
                        {s.primaryPhotoUrl ? (
                          <img
                            src={cloudinaryOptimize(s.primaryPhotoUrl, 500)}
                            alt={s.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-gray-300" aria-hidden />
                          </div>
                        )}
                        <span className="absolute top-2.5 left-2.5 rounded-full bg-emerald-500 px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap text-white">
                          {TRANSACTION_TYPE_LABEL[s.transactionType] ?? s.transactionType}
                        </span>
                      </div>
                      <div className="p-3.5">
                        <p className="mb-1 truncate text-[13px] font-bold">{s.title}</p>
                        <p className="mb-2 flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-[11px] w-[11px]" aria-hidden />
                          {s.city} · {COUNTRY_FLAG[s.country] ?? ''} {s.country}
                        </p>
                        <p className="text-[15px] font-extrabold text-brand">
                          {formatListingPrice(s.price, s.currency)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="flex flex-col gap-3.5 lg:sticky lg:top-5">
            {/* PRICE + AGENT + CTA */}
            <div className="rounded-2xl bg-white p-[22px]">
              <div className="mb-[18px] text-[26px] font-extrabold whitespace-nowrap text-brand">
                {formatListingPrice(listing.price, listing.currency)}
              </div>

              <div className="mb-[18px] flex items-center gap-3 rounded-xl bg-gray-50 p-3.5">
                <InitialsAvatar
                  name={listing.agent.name}
                  email=""
                  avatarUrl={listing.agent.avatarUrl}
                  seed={listing.agent.seed}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{listing.agent.name ?? 'Agent'}</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap text-emerald-600">
                    <BadgeCheck className="h-[11px] w-[11px]" aria-hidden />
                    Vérifié
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setInquiryType('MESSAGE');
                  document.getElementById('inquiry-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-3 py-3.5 text-sm font-bold whitespace-nowrap text-white"
              >
                <Send className="h-[15px] w-[15px]" aria-hidden />
                Contacter l&apos;agent
              </button>
              {listing.agent.phone ? (
                <a
                  href={`tel:${listing.agent.phone}`}
                  className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-gray-50 px-3 py-3 text-sm font-semibold whitespace-nowrap"
                >
                  <Phone className="h-[15px] w-[15px] text-emerald-500" aria-hidden />
                  Appeler l&apos;agent
                </a>
              ) : (
                <InertRow className="mb-2.5">
                  <span className="flex w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-gray-50 px-3 py-3 text-sm font-semibold whitespace-nowrap">
                    <Phone className="h-[15px] w-[15px] text-emerald-500" aria-hidden />
                    Appeler l&apos;agent
                  </span>
                </InertRow>
              )}
              {listing.agent.phone ? (
                <a
                  href={buildWhatsappLink(listing.agent.phone, listing.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 py-3 text-sm font-bold whitespace-nowrap text-white"
                >
                  <MessageCircle className="h-[15px] w-[15px]" aria-hidden />
                  Contacter par WhatsApp
                </a>
              ) : (
                <InertRow className="mb-2.5">
                  <span className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366]/40 px-3 py-3 text-sm font-bold whitespace-nowrap text-white">
                    <MessageCircle className="h-[15px] w-[15px]" aria-hidden />
                    Contacter par WhatsApp
                  </span>
                </InertRow>
              )}
              <button
                type="button"
                onClick={() => {
                  setInquiryType('VR_VISIT');
                  document.getElementById('inquiry-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-brand bg-brand/[0.06] px-3 py-3 text-sm font-bold whitespace-nowrap text-brand"
              >
                <Video className="h-[15px] w-[15px]" aria-hidden />
                Demander une visite VR
              </button>
              <button
                type="button"
                onClick={() => setReportOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 text-xs whitespace-nowrap text-gray-500"
              >
                <Flag className="h-[13px] w-[13px]" aria-hidden />
                Signaler cette annonce
              </button>

              {reportOpen && (
                <div className="mt-3 rounded-xl bg-gray-50 p-3.5">
                  {reportSent ? (
                    <p className="text-center text-xs font-medium text-emerald-600">
                      Signalement envoyé. Merci.
                    </p>
                  ) : (
                    <>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="mb-2 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-xs"
                      >
                        {Object.entries(REPORT_REASON_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={reportDetail}
                        onChange={(e) => setReportDetail(e.target.value)}
                        placeholder="Détail (facultatif)"
                        rows={2}
                        className="mb-2 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-xs"
                      />
                      <button
                        type="button"
                        disabled={reportSending}
                        onClick={submitReport}
                        className="w-full rounded-full bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {reportSending ? 'Envoi…' : 'Envoyer le signalement'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* CONTACT FORM */}
            <div id="inquiry-form" className="rounded-2xl bg-white p-[22px]">
              <div className="mb-4 flex items-center gap-2 text-[15px] font-bold">
                <MessageSquare className="h-4 w-4 text-brand" aria-hidden />
                {inquiryType === 'VR_VISIT' ? 'Demander une visite VR' : 'Envoyer un message'}
              </div>
              {sent ? (
                <p className="rounded-lg bg-emerald-50 p-3 text-center text-xs font-medium text-emerald-600">
                  Votre demande a été envoyée à l&apos;agent.
                </p>
              ) : (
                <form onSubmit={submitInquiry}>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                    Nom complet
                  </p>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Votre nom"
                    className="mb-3 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                  />
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                    Téléphone
                  </p>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+225 · Votre numéro"
                    className="mb-3 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                  />
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                    Message
                  </p>
                  <textarea
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="mb-3 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none"
                  />
                  {sendError && <p className="mb-3 text-xs text-red-500">{sendError}</p>}
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-3 py-3 text-sm font-bold whitespace-nowrap text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </form>
              )}
            </div>

            {/* META CARD */}
            <div className="rounded-2xl bg-white p-[22px]">
              <div className="mb-1 flex items-center gap-2 text-[15px] font-bold">
                <Info className="h-4 w-4 text-brand" aria-hidden />
                Infos pratiques
              </div>
              {[
                { label: 'Référence', value: listing.id.slice(-8).toUpperCase() },
                { label: 'Publié le', value: formatDate(listing.createdAt) },
                {
                  label: 'Type de bien',
                  value: PROPERTY_TYPE_LABEL[listing.propertyType] ?? listing.propertyType,
                },
                {
                  label: 'Transaction',
                  value: TRANSACTION_TYPE_LABEL[listing.transactionType] ?? listing.transactionType,
                },
                { label: 'Statut', value: 'Vérifié', green: true },
              ].map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between border-b border-black/[0.06] py-2.5 text-[13px] last:border-0"
                >
                  <span className="text-gray-500">{m.label}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      m.green ? 'text-emerald-500' : 'text-neutral-900',
                    )}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* GALLERY LIGHTBOX */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/92"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Galerie — ${listing.title}`}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="text-sm font-semibold">
              {listing.title} · {photos.length} photos
            </span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold hover:bg-white/20"
            >
              Fermer
            </button>
          </div>
          <div
            className="flex-1 overflow-y-auto px-4 pb-10 sm:px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-3 sm:grid-cols-2">
              {photos.map((p, i) => (
                <img
                  key={`${p.url}-${i}`}
                  src={cloudinaryOptimize(p.url, 1200)}
                  alt={`${listing.title} — photo ${i + 1}`}
                  className="w-full rounded-lg bg-white/5 object-cover"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <PublicFooter />
    </div>
  );
}
