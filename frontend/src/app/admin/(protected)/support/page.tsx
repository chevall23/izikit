'use client';

import { useState } from 'react';
import {
  FileDown,
  Flag,
  MessageSquare,
  Clock,
  CheckCircle2,
  Timer,
  Tag,
  AlertTriangle,
  Activity,
  Globe,
  Calendar,
  RotateCcw,
  Search,
  AlertOctagon,
  Ban,
  ImageOff,
  HelpCircle,
  MoreHorizontal,
  Eye,
  Check,
  X,
  UserX,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';

// ── Static mockup data (Banani "Modération Support") ────────────────────────────

type Gravite = 'critical' | 'medium' | 'low';
type Statut = 'new' | 'inprogress' | 'resolved' | 'rejected';

const GRAVITE: Record<Gravite, { label: string; tone: AdminStatusTone }> = {
  critical: { label: 'Critique', tone: 'danger' },
  medium: { label: 'Moyenne', tone: 'warning' },
  low: { label: 'Faible', tone: 'neutral' },
};
const STATUT: Record<Statut, { label: string; tone: AdminStatusTone }> = {
  new: { label: 'Nouveau', tone: 'primary' },
  inprogress: { label: 'En cours', tone: 'warning' },
  resolved: { label: 'Résolu', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'neutral' },
};

interface Signalement {
  id: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  typeLabel: string;
  category: string;
  elementName: string;
  elementRef: string;
  motif: string;
  gravite: Gravite;
  statut: Statut;
  date: string;
  detail: {
    signaledAt: string;
    reporterName: string;
    reporterAvatarUrl: string;
    reporterMeta: string;
    description: string;
    subject?: { imageUrl: string; title: string; meta: string; publishedBy: string };
    history: { text: string; time: string; active?: boolean }[];
  };
}

const SIGNALEMENTS: Signalement[] = [
  {
    id: 'HA-8941',
    icon: AlertOctagon,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    typeLabel: 'Annonce frauduleuse',
    category: 'Annonce',
    elementName: 'Villa de luxe – Cocody',
    elementRef: 'Réf. HA-8941 · Abidjan, CI',
    motif: 'Photos volées',
    gravite: 'critical',
    statut: 'new',
    date: '04 juil. 2025',
    detail: {
      signaledAt: '04 juil. 2025 · 11h34',
      reporterName: 'Amadou Diallo',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F2',
      reporterMeta: 'Particulier · Abidjan, CI · +225 07 22 11 90',
      description:
        "« Les photos utilisées pour cette annonce sont identiques à celles d'une villa en vente sur un autre site. Le propriétaire demande un virement de 500 000 FCFA avant toute visite, ce qui est très suspect. J'ai été contacté via WhatsApp avec un numéro étranger. »",
      subject: {
        imageUrl:
          'https://storage.googleapis.com/banani-generated-images/generated-images/96f00759-67e0-476b-be39-d147e08b315d.jpg',
        title: 'Villa de luxe – Cocody',
        meta: 'Réf. HA-8941 · Abidjan, CI · 185 M FCFA',
        publishedBy: 'Agence Babi Prestige',
      },
      history: [
        {
          text: "Signalement reçu et en attente d'examen",
          time: '04 juil. 2025 · 11h34',
          active: true,
        },
        { text: 'Assigné à Kofi Mensah (Admin)', time: '04 juil. 2025 · 12h05' },
      ],
    },
  },
  {
    id: 'moussa-traore',
    icon: Ban,
    iconBg: 'bg-rose-50',
    iconColor: 'text-red-500',
    typeLabel: 'Arnaque',
    category: 'Utilisateur',
    elementName: 'Moussa Traoré',
    elementRef: 'Particulier · Dakar, SN',
    motif: "Demande d'avance",
    gravite: 'critical',
    statut: 'inprogress',
    date: '03 juil. 2025',
    detail: {
      signaledAt: '03 juil. 2025 · 09h20',
      reporterName: 'Aminata Sow',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F3',
      reporterMeta: 'Particulière · Dakar, SN · +221 77 410 22 63',
      description:
        "« Le vendeur m'a demandé un acompte de 500 000 FCFA par Mobile Money avant toute visite, en insistant fortement. Cela ressemble à une tentative d'escroquerie. »",
      history: [
        { text: "Signalement reçu et en attente d'examen", time: '03 juil. 2025 · 09h20' },
        { text: 'Assigné à Kofi Mensah (Admin)', time: '03 juil. 2025 · 10h02', active: true },
      ],
    },
  },
  {
    id: 'HA-8912',
    icon: ImageOff,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    typeLabel: 'Contenu inapproprié',
    category: 'Annonce',
    elementName: 'Appartement Plateau',
    elementRef: 'Réf. HA-8912 · Dakar, SN',
    motif: 'Photos trompeuses',
    gravite: 'medium',
    statut: 'new',
    date: '03 juil. 2025',
    detail: {
      signaledAt: '03 juil. 2025 · 14h50',
      reporterName: 'Cheikh Fall',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F6',
      reporterMeta: 'Particulier · Dakar, SN · +221 78 305 11 47',
      description:
        "« Les photos ne correspondent pas au bien visité sur place — pièces bien plus petites, pas de balcon contrairement à l'annonce. »",
      subject: {
        imageUrl:
          'https://storage.googleapis.com/banani-generated-images/generated-images/caba0b3a-e0b3-4862-824e-5e4ac1b9888c.jpg',
        title: 'Appartement Plateau',
        meta: 'Réf. HA-8912 · Dakar, SN · 72 M FCFA',
        publishedBy: 'Agence Horizon Immo',
      },
      history: [
        {
          text: "Signalement reçu et en attente d'examen",
          time: '03 juil. 2025 · 14h50',
          active: true,
        },
      ],
    },
  },
  {
    id: 'HA-8864',
    icon: AlertOctagon,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    typeLabel: 'Annonce frauduleuse',
    category: 'Annonce',
    elementName: 'Terrain 800m² Cotonou',
    elementRef: 'Réf. HA-8864 · Cotonou, BJ',
    motif: 'Titre de propriété douteux',
    gravite: 'critical',
    statut: 'resolved',
    date: '02 juil. 2025',
    detail: {
      signaledAt: '02 juil. 2025 · 08h10',
      reporterName: 'Rachidatou Bello',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F5',
      reporterMeta: 'Particulière · Cotonou, BJ · +229 96 12 44 08',
      description:
        "« Le document de propriété fourni ne correspond pas au nom du vendeur. J'ai demandé une vérification avant de m'engager. »",
      subject: {
        imageUrl:
          'https://storage.googleapis.com/banani-generated-images/generated-images/05725849-8cd3-4bfd-b818-fd767b0ef4ac.jpg',
        title: 'Terrain 800m² Cotonou',
        meta: 'Réf. HA-8864 · Cotonou, BJ · 24 M FCFA',
        publishedBy: 'Particulier — Julien Ahouansou',
      },
      history: [
        { text: "Signalement reçu et en attente d'examen", time: '02 juil. 2025 · 08h10' },
        { text: 'Assigné à Awa Diallo (Admin)', time: '02 juil. 2025 · 09h15' },
        {
          text: 'Annonce retirée, signalement résolu',
          time: '02 juil. 2025 · 16h40',
          active: true,
        },
      ],
    },
  },
  {
    id: 'agence-immo-plus',
    icon: HelpCircle,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    typeLabel: 'Autre',
    category: 'Utilisateur',
    elementName: 'Agence Immo Plus',
    elementRef: 'Agence · Lomé, TG',
    motif: 'Spam de messages',
    gravite: 'low',
    statut: 'inprogress',
    date: '01 juil. 2025',
    detail: {
      signaledAt: '01 juil. 2025 · 17h05',
      reporterName: 'Yawa Kpodo',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F6',
      reporterMeta: 'Particulière · Lomé, TG · +228 90 44 12 08',
      description:
        "« Cette agence m'envoie des messages promotionnels répétés malgré plusieurs demandes d'arrêt. »",
      history: [
        { text: "Signalement reçu et en attente d'examen", time: '01 juil. 2025 · 17h05' },
        { text: 'Assigné à Kofi Mensah (Admin)', time: '02 juil. 2025 · 08h30', active: true },
      ],
    },
  },
  {
    id: 'HA-8807',
    icon: ImageOff,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    typeLabel: 'Contenu inapproprié',
    category: 'Annonce',
    elementName: 'Local Commercial Lomé',
    elementRef: 'Réf. HA-8807 · Lomé, TG',
    motif: 'Description mensongère',
    gravite: 'medium',
    statut: 'rejected',
    date: '30 juin 2025',
    detail: {
      signaledAt: '30 juin 2025 · 10h22',
      reporterName: 'Kossi Adjovi',
      reporterAvatarUrl:
        'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F8',
      reporterMeta: 'Particulier · Lomé, TG · +228 91 02 55 76',
      description:
        '« La description annonçait une surface bien plus grande que la réalité mesurée sur place. »',
      subject: {
        imageUrl:
          'https://storage.googleapis.com/banani-generated-images/generated-images/6d7fc71b-cdfc-40e3-b22a-e01a1744d201.jpg',
        title: 'Local Commercial Lomé',
        meta: 'Réf. HA-8807 · Lomé, TG · 3,8 M FCFA/mois',
        publishedBy: 'Agence Plateau Business',
      },
      history: [
        { text: "Signalement reçu et en attente d'examen", time: '30 juin 2025 · 10h22' },
        { text: 'Assigné à Awa Diallo (Admin)', time: '30 juin 2025 · 13h10' },
        { text: 'Signalement jugé infondé — rejeté', time: '01 juil. 2025 · 09h00', active: true },
      ],
    },
  },
];

const FILTERS = [
  { icon: Tag, label: 'Motif' },
  { icon: AlertTriangle, label: 'Gravité' },
  { icon: Activity, label: 'Statut' },
  { icon: Globe, label: 'Pays' },
  { icon: Calendar, label: 'Période' },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminSupportPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = SIGNALEMENTS.find((s) => s.id === selectedId) ?? null;

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
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden />
          Exporter
        </button>
      </div>

      {/* Main tabs — only "Signalements" has a built screen so far */}
      <div className="flex w-fit items-center gap-1 rounded-xl border border-black/[0.08] bg-white p-1">
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-semibold text-brand-foreground"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden />
          Signalements
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] font-bold">
            14
          </span>
        </button>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold text-gray-400"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Support client
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[11px] font-bold">
            5
          </span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AdminStatCard
          icon={<Clock className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
          tone="warning"
          label="Signalements en attente"
          value="14"
          sub="+3 depuis hier"
        />
        <AdminStatCard
          icon={<CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" aria-hidden />}
          tone="success"
          label="Traités cette semaine"
          value="27"
          sub="Sur 31 signalements reçus"
        />
        <AdminStatCard
          icon={<Timer className="h-[18px] w-[18px] text-brand" aria-hidden />}
          label="Temps de traitement moyen"
          value="4h 12m"
          sub="Objectif : moins de 6h"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-black/[0.08] bg-white p-3">
        <span className="text-[12px] font-semibold whitespace-nowrap text-gray-400">Filtrer :</span>
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className="flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] font-medium whitespace-nowrap text-neutral-900"
          >
            <f.icon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
            {f.label}
          </button>
        ))}
        <span className="hidden h-6 w-px bg-black/[0.08] sm:block" aria-hidden />
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 px-2 text-[13px] font-semibold whitespace-nowrap text-gray-400"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Réinitialiser
        </button>
      </div>

      {/* Signalements table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-[18px] py-4">
          <span className="font-sora text-[14px] font-bold text-neutral-900">41 signalements</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-9 w-[200px] items-center gap-2 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] text-gray-400">
              <Search className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              Rechercher…
            </span>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-neutral-900"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Exporter CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {['', 'Élément concerné', 'Motif', 'Gravité', 'Statut', 'Date', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIGNALEMENTS.map((s, i) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`cursor-pointer border-t border-black/[0.05] ${i % 2 === 0 ? '' : 'bg-gray-50/60'}`}
                >
                  <td className="px-3.5 py-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.iconBg}`}
                    >
                      <s.icon className={`h-4 w-4 ${s.iconColor}`} aria-hidden />
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-bold text-neutral-900">
                        {s.typeLabel}
                      </div>
                      <div className="truncate text-[11px] text-gray-400">{s.category}</div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-brand">
                        {s.elementName}
                      </div>
                      <div className="truncate text-[11px] text-gray-400">{s.elementRef}</div>
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-3.5 py-2.5 text-[12px] text-gray-700">
                    {s.motif}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <AdminStatusBadge tone={GRAVITE[s.gravite].tone}>
                      {GRAVITE[s.gravite].label}
                    </AdminStatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <AdminStatusBadge tone={STATUT[s.statut].tone}>
                      {STATUT[s.statut].label}
                    </AdminStatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                    {s.date}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <button
                      type="button"
                      aria-label={`Actions — ${s.elementName}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-100"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-400" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminPagination
          from={1}
          to={6}
          total={41}
          itemLabel="signalements"
          pages={[1, 2, 3, 5]}
          activePage={1}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={selected != null}
        onClose={() => setSelectedId(null)}
        title="Détail du signalement"
        titleExtra={
          selected && (
            <AdminStatusBadge tone={GRAVITE[selected.gravite].tone}>
              {GRAVITE[selected.gravite].label}
            </AdminStatusBadge>
          )
        }
        footer={
          <>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Suspendre l&apos;annonce
              </button>
              <button
                type="button"
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500"
              >
                <UserX className="h-3.5 w-3.5" aria-hidden />
                Suspendre l&apos;utilisateur
              </button>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold whitespace-nowrap text-emerald-600"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Marquer comme résolu
              </button>
              <button
                type="button"
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                Contacter le signalant
              </button>
            </div>
          </>
        }
      >
        {selected && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <InfoItem k="Type" v={selected.typeLabel} />
              <InfoItem k="Motif" v={selected.motif} />
              <InfoItem k="Gravité" v={GRAVITE[selected.gravite].label} tone="danger" />
              <InfoItem k="Signalé le" v={selected.detail.signaledAt} />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Élément concerné</p>
              {selected.detail.subject ? (
                <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3.5">
                  <img
                    src={selected.detail.subject.imageUrl}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-[10px] object-cover"
                  />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-brand">
                      {selected.detail.subject.title}
                    </div>
                    <div className="text-[12px] text-gray-400">{selected.detail.subject.meta}</div>
                    <div className="mt-1 text-[12px] text-gray-400">
                      Publiée par : {selected.detail.subject.publishedBy}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-gray-50 p-3.5">
                  <div className="text-[14px] font-semibold text-brand">{selected.elementName}</div>
                  <div className="text-[12px] text-gray-400">{selected.elementRef}</div>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Signalé par</p>
              <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3.5">
                <img
                  src={selected.detail.reporterAvatarUrl}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-neutral-900">
                    {selected.detail.reporterName}
                  </div>
                  <div className="text-[12px] text-gray-400">{selected.detail.reporterMeta}</div>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">
                Description du signalement
              </p>
              <div className="rounded-2xl bg-gray-50 p-3.5">
                <p className="text-[13px] leading-relaxed text-gray-700">
                  {selected.detail.description}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Changer le statut</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex h-[34px] items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-foreground"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  En cours
                </button>
                <button
                  type="button"
                  className="flex h-[34px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-600"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Résoudre
                </button>
                <button
                  type="button"
                  className="flex h-[34px] items-center gap-1.5 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[12px] font-semibold text-gray-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Rejeter
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold text-gray-400">Historique de traitement</p>
              <div className="flex flex-col gap-3">
                {selected.detail.history.map((h) => (
                  <div key={h.time} className="flex items-start gap-2.5">
                    <span
                      className={`mt-[5px] h-2 w-2 flex-shrink-0 rounded-full ${h.active ? 'bg-brand' : 'bg-gray-200'}`}
                      aria-hidden
                    />
                    <div>
                      <div className="text-[13px] leading-snug text-gray-700">{h.text}</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">{h.time}</div>
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
                placeholder="Écrire une note pour l'équipe…"
                className="w-full resize-none rounded-lg border border-black/[0.08] bg-white px-3 py-2.5 text-[13px] text-neutral-900 outline-none placeholder:text-gray-400 focus:border-brand"
              />
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
        className={`text-[13px] font-semibold ${tone === 'danger' ? 'text-red-500' : 'text-neutral-900'}`}
      >
        {v}
      </div>
    </div>
  );
}
