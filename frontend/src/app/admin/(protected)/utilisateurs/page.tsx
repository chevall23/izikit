'use client';

import { useState } from 'react';
import {
  Download,
  UserPlus,
  Users,
  UserRoundPlus,
  ShieldQuestion,
  Search,
  ChevronDown,
  XCircle,
  Ban,
  Check,
  Eye,
  MoreHorizontal,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  FileText,
  TrendingUp,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminBulkBar } from '@/components/admin/AdminBulkBar';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Gestion Utilisateurs") ──────────────────────────

type UserType = 'Agence' | 'Particulier' | 'Démarcheur';
type Status = 'Actif' | 'En vérif.' | 'Suspendu';

const TYPE_TONE: Record<UserType, AdminStatusTone> = {
  Agence: 'primary',
  Particulier: 'neutral',
  Démarcheur: 'warning',
};
const STATUS_TONE: Record<Status, AdminStatusTone> = {
  Actif: 'success',
  'En vérif.': 'warning',
  Suspendu: 'danger',
};

interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  type: UserType;
  countryFlag: string;
  countryCode: string;
  status: Status;
  annonces: number;
  jetons: number;
  joined: string;
  detail: {
    phone: string;
    city: string;
    kyc?: { verified: boolean; docs: string[] };
    rating: string;
    conversion: string;
    listings: { title: string; meta: string; status: 'Validée' | 'En attente'; imageUrl: string }[];
  };
}

const USERS: AdminUser[] = [
  {
    id: 'ama-kouassi',
    name: 'Ama Kouassi',
    email: 'ama.kouassi@agence-prestige.ci',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F2',
    type: 'Agence',
    countryFlag: '🇨🇮',
    countryCode: 'CI',
    status: 'Actif',
    annonces: 34,
    jetons: 120,
    joined: '12 juin 2024',
    detail: {
      phone: '+225 07 08 12 34 56',
      city: "Abidjan, Côte d'Ivoire",
      kyc: {
        verified: true,
        docs: ['Registre de commerce · RC-CI-2021-B-04821', "Pièce d'identité dirigeant"],
      },
      rating: '4,7 ★',
      conversion: '22,6%',
      listings: [
        {
          title: 'Villa F5 à Cocody, piscine',
          meta: '320 M FCFA · Vente',
          status: 'Validée',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/773113c6-30ca-4dd0-a6be-3f6574e9345d.jpg',
        },
        {
          title: 'Appartement T3 Plateau',
          meta: '95 M FCFA · Vente',
          status: 'En attente',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/a6724078-48fb-4caa-ad20-a93d7f949415.jpg',
        },
        {
          title: 'Plateau bureaux Zone 4',
          meta: '1,2 M FCFA/mois · Location',
          status: 'Validée',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/20853626-2d8e-40da-a67a-de3e4db786e8.jpg',
        },
      ],
    },
  },
  {
    id: 'komi-agbodjan',
    name: 'Komi Agbodjan',
    email: 'k.agbodjan@demo.tg',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F5',
    type: 'Particulier',
    countryFlag: '🇹🇬',
    countryCode: 'TG',
    status: 'Actif',
    annonces: 7,
    jetons: 45,
    joined: '02 jan. 2025',
    detail: {
      phone: '+228 90 11 22 45',
      city: 'Lomé, Togo',
      rating: '4,2 ★',
      conversion: '18,4%',
      listings: [
        {
          title: 'Appartement T4 centre-ville',
          meta: '72 M FCFA · Vente',
          status: 'Validée',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/caba0b3a-e0b3-4862-824e-5e4ac1b9888c.jpg',
        },
      ],
    },
  },
  {
    id: 'fatou-diallo',
    name: 'Fatou Diallo',
    email: 'fatou.diallo@immo-sn.sn',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F7',
    type: 'Agence',
    countryFlag: '🇸🇳',
    countryCode: 'SN',
    status: 'En vérif.',
    annonces: 19,
    jetons: 0,
    joined: '18 avr. 2025',
    detail: {
      phone: '+221 77 44 09 21',
      city: 'Dakar, Sénégal',
      kyc: {
        verified: false,
        docs: ['Registre de commerce · en attente', "Pièce d'identité dirigeante · en attente"],
      },
      rating: '—',
      conversion: '9,1%',
      listings: [
        {
          title: 'Terrain 800 m² en périphérie',
          meta: '24 M FCFA · Vente',
          status: 'En attente',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/05725849-8cd3-4bfd-b818-fd767b0ef4ac.jpg',
        },
      ],
    },
  },
  {
    id: 'moussa-traore',
    name: 'Moussa Traoré',
    email: 'moussa.t@habitation-bj.bj',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F1',
    type: 'Démarcheur',
    countryFlag: '🇧🇯',
    countryCode: 'BJ',
    status: 'Actif',
    annonces: 4,
    jetons: 88,
    joined: '25 mars 2025',
    detail: {
      phone: '+229 97 15 06 32',
      city: 'Cotonou, Bénin',
      rating: '4,0 ★',
      conversion: '15,7%',
      listings: [
        {
          title: 'Local Commercial Lomé',
          meta: '3,8 M FCFA/mois · Location',
          status: 'Validée',
          imageUrl:
            'https://storage.googleapis.com/banani-generated-images/generated-images/6d7fc71b-cdfc-40e3-b22a-e01a1744d201.jpg',
        },
      ],
    },
  },
  {
    id: 'jean-pierre-dossou',
    name: 'Jean-Pierre Dossou',
    email: 'jp.dossou@luxe-immo.ci',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F50-65%2FAfrican%2F4',
    type: 'Agence',
    countryFlag: '🇨🇮',
    countryCode: 'CI',
    status: 'Suspendu',
    annonces: 62,
    jetons: 0,
    joined: '07 oct. 2023',
    detail: {
      phone: '+225 05 44 90 12',
      city: "Abidjan, Côte d'Ivoire",
      kyc: {
        verified: true,
        docs: ['Registre de commerce · RC-CI-2019-B-01187', "Pièce d'identité dirigeant"],
      },
      rating: '3,1 ★',
      conversion: '6,4%',
      listings: [],
    },
  },
  {
    id: 'aissatou-ba',
    name: 'Aïssatou Ba',
    email: 'aissatou.ba@gmail.sn',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F18-25%2FAfrican%2F3',
    type: 'Particulier',
    countryFlag: '🇸🇳',
    countryCode: 'SN',
    status: 'Actif',
    annonces: 2,
    jetons: 15,
    joined: '30 juin 2025',
    detail: {
      phone: '+221 78 30 55 19',
      city: 'Dakar, Sénégal',
      rating: '4,5 ★',
      conversion: '20,0%',
      listings: [],
    },
  },
];

const TABS: { key: 'all' | UserType; label: string; count: number }[] = [
  { key: 'all', label: 'Tous', count: 3284 },
  { key: 'Particulier', label: 'Particuliers', count: 1840 },
  { key: 'Agence', label: 'Agences', count: 912 },
  { key: 'Démarcheur', label: 'Démarcheurs', count: 487 },
];

const FILTERS = ['Statut', 'Pays', "Date d'inscription"];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminUtilisateursPage() {
  const [tab, setTab] = useState<'all' | UserType>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set(['ama-kouassi']));
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedUser = USERS.find((u) => u.id === openId) ?? null;

  const rows = tab === 'all' ? USERS : USERS.filter((u) => u.type === tab);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AdminShell active="users" searchPlaceholder="Rechercher un utilisateur, annonce, paiement…">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">
            Administration · Multi-pays agrégée
          </p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Utilisateurs
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Gestion des comptes, vérifications KYC, activité et transactions de tous les profils
            inscrits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex h-[38px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exporter CSV
          </button>
          <button
            type="button"
            className="flex h-[38px] items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-brand-foreground"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />+ Ajouter un admin
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <AdminKpiCard
          icon={<Users className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="+6,4%"
          deltaTone="up"
          value="3 284"
          label="Total utilisateurs"
          footLeft="Agences, particuliers, démarcheurs, admins"
          footRight=""
        />
        <AdminKpiCard
          icon={<UserRoundPlus className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="+14,6%"
          deltaTone="up"
          value="986"
          label="Nouvelles inscriptions · 7j"
          footLeft="Comparé aux 7 jours précédents"
          footRight=""
        />
        <AdminKpiCard
          icon={<ShieldQuestion className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
          delta="+3"
          deltaTone="warn"
          value="47"
          label="Comptes en attente de vérification"
          footLeft="KYC et documents en cours de traitement"
          footRight=""
        />
      </section>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-col gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-sora text-[15px] font-bold text-neutral-900">
              Tous les utilisateurs
            </span>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-brand">
              3 284 au total
            </span>
          </div>

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
                  {t.count.toLocaleString('fr-FR')}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-[34px] min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] text-gray-400">
              <Search className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              Rechercher nom, email ou téléphone…
            </span>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="flex h-[34px] items-center gap-1.5 rounded-lg border border-black/[0.08] bg-gray-50 px-3 text-[13px] font-medium whitespace-nowrap text-neutral-900"
              >
                {f}
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              className="flex h-[34px] items-center gap-1.5 px-2 text-[13px] font-semibold whitespace-nowrap text-brand"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              Réinitialiser
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <AdminBulkBar
            count={selected.size}
            actions={
              <>
                <button
                  type="button"
                  className="flex h-[30px] items-center gap-1.5 rounded-lg bg-red-50 px-3 text-[12px] font-semibold whitespace-nowrap text-red-500"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Suspendre
                </button>
                <button
                  type="button"
                  className="flex h-[30px] items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-neutral-900"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Exporter CSV
                </button>
              </>
            }
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {[
                  '',
                  'Utilisateur',
                  'Type',
                  'Pays',
                  'Statut',
                  'Annonces',
                  'Jetons',
                  'Inscription',
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
                    Aucun utilisateur dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((u, i) => (
                  <tr
                    key={u.id}
                    onClick={() => setOpenId(u.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      selected.has(u.id) ? 'bg-brand/5' : i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Sélectionner ${u.name}`}
                        aria-pressed={selected.has(u.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelected(u.id);
                        }}
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-[4px] border-2',
                          selected.has(u.id)
                            ? 'border-brand bg-brand'
                            : 'border-black/[0.15] bg-white',
                        )}
                      >
                        {selected.has(u.id) && (
                          <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {u.name}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={TYPE_TONE[u.type]}>{u.type}</AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {u.countryFlag} {u.countryCode}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[u.status]}>{u.status}</AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
                      {u.annonces}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
                      {u.jetons}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {u.joined}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${u.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(u.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Eye className="h-3.5 w-3.5 text-brand" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions — ${u.name}`}
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
          total={tab === 'all' ? 3284 : (TABS.find((t) => t.key === tab)?.count ?? rows.length)}
          itemLabel="utilisateurs"
          perPage={25}
          pages={[1, 2, 3, '…', 132]}
          activePage={1}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={selectedUser != null}
        onClose={() => setOpenId(null)}
        header={
          selectedUser && (
            <div className="flex min-w-0 items-center gap-3.5">
              <img
                src={selectedUser.avatarUrl}
                alt=""
                className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="truncate font-sora text-[17px] font-bold text-neutral-900">
                  {selectedUser.name}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <AdminStatusBadge tone={TYPE_TONE[selectedUser.type]}>
                    {selectedUser.type}
                  </AdminStatusBadge>
                  <AdminStatusBadge tone={STATUS_TONE[selectedUser.status]}>
                    {selectedUser.status}
                  </AdminStatusBadge>
                  {selectedUser.detail.kyc?.verified && (
                    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-100 px-2.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      Vérifié KYC
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        }
        footer={
          selectedUser && (
            <>
              <button
                type="button"
                className={cn(
                  'flex h-[38px] items-center justify-center gap-2 rounded-lg text-[14px] font-semibold',
                  selectedUser.status === 'Suspendu'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-500',
                )}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                {selectedUser.status === 'Suspendu' ? 'Réactiver le compte' : 'Suspendre le compte'}
              </button>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg border border-brand text-[14px] font-semibold text-brand"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  Envoyer un message
                </button>
                <button
                  type="button"
                  className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Modifier le profil
                </button>
              </div>
            </>
          )
        }
      >
        {selectedUser && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <StatItem value={String(selectedUser.annonces)} label="Annonces actives" />
              <StatItem value={String(selectedUser.jetons)} label="Jetons restants" />
              <StatItem value={selectedUser.detail.rating} label="Note moyenne" />
            </div>

            <div>
              <p className="mb-3 text-[13px] font-bold text-neutral-900">Informations de contact</p>
              <div className="flex flex-col gap-3">
                <ContactRow
                  icon={<Mail className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Email"
                  value={selectedUser.email}
                />
                <ContactRow
                  icon={<Phone className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Téléphone"
                  value={selectedUser.detail.phone}
                />
                <ContactRow
                  icon={<MapPin className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Pays / Ville"
                  value={selectedUser.detail.city}
                />
                <ContactRow
                  icon={<Calendar className="h-[15px] w-[15px] text-brand" aria-hidden />}
                  label="Date d'inscription"
                  value={selectedUser.joined}
                />
              </div>
            </div>

            {selectedUser.detail.kyc && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-amber-800">
                  <ShieldCheck className="h-[15px] w-[15px]" aria-hidden />
                  {selectedUser.detail.kyc.verified
                    ? 'Documents KYC — Agence vérifiée'
                    : 'Documents KYC — En cours de vérification'}
                </div>
                <div className="flex flex-col gap-2">
                  {selectedUser.detail.kyc.docs.map((doc) => (
                    <div
                      key={doc}
                      className="flex items-center gap-2.5 rounded-md bg-white px-3 py-2"
                    >
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden />
                      <span className="flex-1 truncate text-[13px] text-neutral-900">{doc}</span>
                      <button
                        type="button"
                        className="flex-shrink-0 text-[12px] font-semibold whitespace-nowrap text-brand"
                      >
                        Voir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex gap-4 border-b border-black/[0.08]">
                {['Annonces', 'Transactions', 'Activité'].map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      '-mb-px border-b-2 pb-2.5 text-[13px] font-semibold whitespace-nowrap',
                      i === 0 ? 'border-brand text-brand' : 'border-transparent text-gray-400',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2.5 pt-3.5">
                {selectedUser.detail.listings.length === 0 ? (
                  <p className="text-[13px] text-gray-400">
                    Aucune annonce publiée pour l&apos;instant.
                  </p>
                ) : (
                  selectedUser.detail.listings.map((l) => (
                    <div
                      key={l.title}
                      className="flex items-center gap-2.5 rounded-lg border border-black/[0.08] p-2.5"
                    >
                      <img
                        src={l.imageUrl}
                        alt=""
                        className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">
                          {l.title}
                        </div>
                        <div className="truncate text-[12px] text-gray-400">{l.meta}</div>
                      </div>
                      <AdminStatusBadge tone={l.status === 'Validée' ? 'success' : 'warning'}>
                        {l.status}
                      </AdminStatusBadge>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-lg bg-gray-50 p-3.5">
              <TrendingUp className="h-5 w-5 flex-shrink-0 text-brand" aria-hidden />
              <div>
                <div className="text-[13px] font-bold text-neutral-900">
                  Taux de conversion : {selectedUser.detail.conversion}
                </div>
                <div className="text-[12px] text-gray-400">
                  Annonces → visites confirmées (30 derniers jours)
                </div>
              </div>
            </div>
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center">
      <div className="text-[20px] leading-none font-bold text-neutral-900">{value}</div>
      <div className="mt-1 text-[11px] text-gray-400">{label}</div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="text-[13px] font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
