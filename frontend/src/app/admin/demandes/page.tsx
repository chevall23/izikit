'use client';

import { useState } from 'react';
import {
  FileText,
  Clock3,
  CheckCircle2,
  XCircle,
  Download,
  Plus,
  Globe,
  Tag,
  CircleDot,
  Calendar,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  Pencil,
  MoreHorizontal,
  Home,
  MapPin,
  Maximize2,
  DoorOpen,
  Bath,
  Waves,
  Archive,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { cn } from '@/lib/utils';

// ── Static mockup data (Banani "Demandes Admin") ─────────────────────────────────

type Status = 'En attente' | 'Transmise' | 'Archivée';
type Priority = 'Haute' | 'Normale' | 'Basse';

const STATUS_TONE: Record<Status, AdminStatusTone> = {
  'En attente': 'warning',
  Transmise: 'success',
  Archivée: 'neutral',
};
const PRIORITY_TONE: Record<Priority, AdminStatusTone> = {
  Haute: 'warning',
  Normale: 'neutral',
  Basse: 'success',
};

interface CriteriaTag {
  icon: typeof Home;
  label: string;
}

interface Request {
  id: string;
  ref: string;
  requesterName: string;
  requesterAvatarUrl: string;
  countryFlag: string;
  location: string;
  countryCode: string;
  propertyType: string;
  budget: string;
  status: Status;
  createdAt: string;
  detail: {
    title: string;
    requesterPhone: string;
    requesterEmail: string;
    criteria: CriteriaTag[];
    budgetMin: string;
    budgetMax: string;
    transaction: string;
    financing: string;
    depositDate: string;
    targetCountry: string;
    assignedAgent: string;
    priority: Priority;
    note: string;
  };
}

const REQUESTS: Request[] = [
  {
    id: 'aminata-kone',
    ref: 'DEM-0047',
    requesterName: 'Aminata Koné',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F2',
    countryFlag: '🇨🇮',
    location: 'Abidjan',
    countryCode: 'CI',
    propertyType: 'Villa',
    budget: '80M – 200M FCFA',
    status: 'En attente',
    createdAt: '12 juil. 2025',
    detail: {
      title: 'Demande de villa à Abidjan',
      requesterPhone: '+225 07 00 11 22',
      requesterEmail: 'aminata.kone@email.com',
      criteria: [
        { icon: Home, label: 'Villa' },
        { icon: MapPin, label: 'Cocody, Abidjan' },
        { icon: Maximize2, label: '200 m² +' },
        { icon: DoorOpen, label: '4+ pièces' },
        { icon: Bath, label: '3+ salles de bain' },
        { icon: Waves, label: 'Piscine souhaitable' },
      ],
      budgetMin: '80 000 000 FCFA',
      budgetMax: '200 000 000 FCFA',
      transaction: 'Achat / Vente',
      financing: 'Cash ou prêt bancaire',
      depositDate: '12 juillet 2025',
      targetCountry: "🇨🇮 Côte d'Ivoire",
      assignedAgent: 'Non assigné',
      priority: 'Haute',
      note: 'Recherche urgente pour installation familiale. Préférence pour quartier sécurisé, proche des écoles internationales de Cocody.',
    },
  },
  {
    id: 'kwame-asante',
    ref: 'DEM-0046',
    requesterName: 'Kwame Asante',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F5',
    countryFlag: '🇸🇳',
    location: 'Dakar',
    countryCode: 'SN',
    propertyType: 'Appartement',
    budget: '30M – 60M FCFA',
    status: 'Transmise',
    createdAt: '10 juil. 2025',
    detail: {
      title: "Demande d'appartement à Dakar",
      requesterPhone: '+221 77 30 44 12',
      requesterEmail: 'kwame.asante@email.com',
      criteria: [
        { icon: Home, label: 'Appartement' },
        { icon: MapPin, label: 'Plateau, Dakar' },
        { icon: Maximize2, label: '90 m² +' },
        { icon: DoorOpen, label: '3+ pièces' },
      ],
      budgetMin: '30 000 000 FCFA',
      budgetMax: '60 000 000 FCFA',
      transaction: 'Achat / Vente',
      financing: 'Prêt bancaire',
      depositDate: '10 juillet 2025',
      targetCountry: '🇸🇳 Sénégal',
      assignedAgent: 'Non assigné',
      priority: 'Normale',
      note: 'Déjà transmise à un agent local — en attente de premières propositions.',
    },
  },
  {
    id: 'fatou-diallo',
    ref: 'DEM-0045',
    requesterName: 'Fatou Diallo',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F1',
    countryFlag: '🇧🇯',
    location: 'Cotonou',
    countryCode: 'BJ',
    propertyType: 'Terrain',
    budget: '10M – 25M FCFA',
    status: 'En attente',
    createdAt: '9 juil. 2025',
    detail: {
      title: 'Demande de terrain à Cotonou',
      requesterPhone: '+229 96 22 18 40',
      requesterEmail: 'fatou.diallo@email.com',
      criteria: [
        { icon: Home, label: 'Terrain' },
        { icon: MapPin, label: 'Akpakpa, Cotonou' },
        { icon: Maximize2, label: '400 m² +' },
      ],
      budgetMin: '10 000 000 FCFA',
      budgetMax: '25 000 000 FCFA',
      transaction: 'Achat / Vente',
      financing: 'Cash',
      depositDate: '9 juillet 2025',
      targetCountry: '🇧🇯 Bénin',
      assignedAgent: 'Non assigné',
      priority: 'Haute',
      note: 'Souhaite finaliser rapidement, projet de construction familiale déjà planifié.',
    },
  },
  {
    id: 'yao-mensah',
    ref: 'DEM-0044',
    requesterName: 'Yao Mensah',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F18-25%2FAfrican%2F3',
    countryFlag: '🇹🇬',
    location: 'Lomé',
    countryCode: 'TG',
    propertyType: 'Bureau',
    budget: '5M – 15M/mois',
    status: 'Transmise',
    createdAt: '7 juil. 2025',
    detail: {
      title: 'Demande de bureau à Lomé',
      requesterPhone: '+228 91 05 33 27',
      requesterEmail: 'yao.mensah@email.com',
      criteria: [
        { icon: Home, label: 'Bureau' },
        { icon: MapPin, label: 'Bè, Lomé' },
        { icon: Maximize2, label: '150 m² +' },
      ],
      budgetMin: '5 000 000 FCFA/mois',
      budgetMax: '15 000 000 FCFA/mois',
      transaction: 'Location',
      financing: 'Sans objet (location)',
      depositDate: '7 juillet 2025',
      targetCountry: '🇹🇬 Togo',
      assignedAgent: 'Non assigné',
      priority: 'Normale',
      note: "Recherche un espace pour l'extension de son entreprise, disponibilité immédiate souhaitée.",
    },
  },
  {
    id: 'nadia-toure',
    ref: 'DEM-0043',
    requesterName: 'Nadia Touré',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FEast%20Asian%2F2',
    countryFlag: '🇨🇮',
    location: 'Yamoussoukro',
    countryCode: 'CI',
    propertyType: 'Maison',
    budget: '40M – 90M FCFA',
    status: 'En attente',
    createdAt: '5 juil. 2025',
    detail: {
      title: 'Demande de maison à Yamoussoukro',
      requesterPhone: '+225 05 18 40 09',
      requesterEmail: 'nadia.toure@email.com',
      criteria: [
        { icon: Home, label: 'Maison' },
        { icon: MapPin, label: 'Yamoussoukro' },
        { icon: Maximize2, label: '250 m² +' },
        { icon: DoorOpen, label: '5+ pièces' },
      ],
      budgetMin: '40 000 000 FCFA',
      budgetMax: '90 000 000 FCFA',
      transaction: 'Achat / Vente',
      financing: 'Cash ou prêt bancaire',
      depositDate: '5 juillet 2025',
      targetCountry: "🇨🇮 Côte d'Ivoire",
      assignedAgent: 'Non assigné',
      priority: 'Basse',
      note: 'Projet à moyen terme, pas de contrainte de délai particulière.',
    },
  },
  {
    id: 'ibrahim-sow',
    ref: 'DEM-0042',
    requesterName: 'Ibrahim Sow',
    requesterAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F7',
    countryFlag: '🇸🇳',
    location: 'Saint-Louis',
    countryCode: 'SN',
    propertyType: 'Villa',
    budget: '120M – 300M FCFA',
    status: 'Archivée',
    createdAt: '1 juil. 2025',
    detail: {
      title: 'Demande de villa à Saint-Louis',
      requesterPhone: '+221 78 40 15 63',
      requesterEmail: 'ibrahim.sow@email.com',
      criteria: [
        { icon: Home, label: 'Villa' },
        { icon: MapPin, label: 'Saint-Louis' },
        { icon: Maximize2, label: '300 m² +' },
      ],
      budgetMin: '120 000 000 FCFA',
      budgetMax: '300 000 000 FCFA',
      transaction: 'Achat / Vente',
      financing: 'Cash',
      depositDate: '1 juillet 2025',
      targetCountry: '🇸🇳 Sénégal',
      assignedAgent: 'Non assigné',
      priority: 'Normale',
      note: "Demande archivée — le demandeur a informé l'équipe avoir trouvé un bien par un autre canal.",
    },
  },
];

const TABS: { key: 'all' | Status; label: string; count: number }[] = [
  { key: 'all', label: 'Toutes', count: 47 },
  { key: 'En attente', label: 'En attente', count: 12 },
  { key: 'Transmise', label: 'Transmises', count: 29 },
  { key: 'Archivée', label: 'Archivées', count: 6 },
];

const FILTERS = [
  { icon: Globe, label: 'Pays' },
  { icon: Tag, label: 'Type de bien' },
  { icon: CircleDot, label: 'Statut' },
  { icon: Calendar, label: 'Date' },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminDemandesPage() {
  const [tab, setTab] = useState<'all' | Status>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedRequest = REQUESTS.find((r) => r.id === openId) ?? null;

  const rows = tab === 'all' ? REQUESTS : REQUESTS.filter((r) => r.status === tab);

  return (
    <AdminShell
      active="demande"
      searchPlaceholder="Rechercher une demande, un demandeur, un agent…"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Administration · Privé</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Demandes immobilières
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Suivi et traitement de toutes les demandes déposées par les utilisateurs. Accès
            restreint à l&apos;équipe admin.
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
            Nouvelle demande
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard
          icon={<FileText className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="+3 ce mois"
          deltaTone="up"
          value="47"
          label="Demandes totales"
          footLeft="Tous statuts confondus"
          footRight=""
        />
        <AdminKpiCard
          icon={<Clock3 className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="À traiter"
          deltaTone="warn"
          value="12"
          label="En attente de traitement"
          footLeft="Priorité haute"
          footRight=""
        />
        <AdminKpiCard
          icon={<CheckCircle2 className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="+8 ce mois"
          deltaTone="up"
          value="29"
          label="Traitées / Transmises"
          footLeft="Agents notifiés"
          footRight=""
        />
        <AdminKpiCard
          icon={<XCircle className="h-[18px] w-[18px] text-brand" aria-hidden />}
          delta="Stable"
          deltaTone="neutral"
          value="6"
          label="Archivées / Annulées"
          footLeft="Sur les 30 derniers jours"
          footRight=""
        />
      </section>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-black/[0.08] px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="font-sora text-[15px] font-bold text-neutral-900">
              Liste des demandes
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
            Rechercher par nom, réf…
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
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {[
                  '',
                  'Demandeur',
                  'Pays / Ville',
                  'Type de bien',
                  'Budget',
                  'Statut',
                  'Date de dépôt',
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
                  <td colSpan={8} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune demande dans cette catégorie pour l&apos;instant.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
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
                          src={r.requesterAvatarUrl}
                          alt=""
                          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-neutral-900">
                            {r.requesterName}
                          </div>
                          <div className="truncate text-[11px] text-gray-400">Réf. {r.ref}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {r.countryFlag} {r.location}, {r.countryCode}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                      {r.propertyType}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                      {r.budget}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[r.status]}>{r.status}</AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {r.createdAt}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Voir — ${r.requesterName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(r.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Eye className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Modifier — ${r.requesterName}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100"
                        >
                          <Pencil className="h-3.5 w-3.5 text-neutral-900" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions — ${r.requesterName}`}
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
          total={tab === 'all' ? 47 : (TABS.find((t) => t.key === tab)?.count ?? rows.length)}
          itemLabel="demandes"
          perPage={6}
          pages={[1, 2, 3, '…', 8]}
          activePage={1}
        />
      </div>

      {/* Detail drawer */}
      <AdminDrawer
        open={selectedRequest != null}
        onClose={() => setOpenId(null)}
        title={selectedRequest?.detail.title ?? ''}
        titleExtra={
          selectedRequest && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {selectedRequest.ref} · Privé admin
            </span>
          )
        }
        footer={
          selectedRequest && (
            <>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-emerald-50 text-[14px] font-semibold text-emerald-600"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Transmettre à un agent
              </button>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Modifier la demande
              </button>
              <button
                type="button"
                className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archiver / Annuler
              </button>
            </>
          )
        }
      >
        {selectedRequest && (
          <>
            <div className="flex items-center gap-3">
              <img
                src={selectedRequest.requesterAvatarUrl}
                alt=""
                className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-neutral-900">
                  {selectedRequest.requesterName}
                </div>
                <div className="truncate text-[12px] text-gray-400">
                  {selectedRequest.detail.requesterPhone} · {selectedRequest.detail.requesterEmail}
                </div>
              </div>
              <AdminStatusBadge tone={STATUS_TONE[selectedRequest.status]}>
                {selectedRequest.status}
              </AdminStatusBadge>
            </div>

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Critères de recherche</p>
              <div className="flex flex-wrap gap-2">
                {selectedRequest.detail.criteria.map(({ icon: Icon, label }) => (
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
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Détails financiers</p>
              <div className="flex flex-col gap-2.5">
                <DrawerRow k="Budget minimum" v={selectedRequest.detail.budgetMin} />
                <DrawerRow k="Budget maximum" v={selectedRequest.detail.budgetMax} />
                <DrawerRow k="Transaction" v={selectedRequest.detail.transaction} />
                <DrawerRow k="Financement" v={selectedRequest.detail.financing} />
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div>
              <p className="mb-2.5 text-[13px] font-bold text-neutral-900">Informations admin</p>
              <div className="flex flex-col gap-2.5">
                <DrawerRow k="Date de dépôt" v={selectedRequest.detail.depositDate} />
                <DrawerRow k="Pays cible" v={selectedRequest.detail.targetCountry} />
                <DrawerRow k="Agent assigné" v={selectedRequest.detail.assignedAgent} />
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-gray-400">Priorité</span>
                  <AdminStatusBadge tone={PRIORITY_TONE[selectedRequest.detail.priority]}>
                    {selectedRequest.detail.priority}
                  </AdminStatusBadge>
                </div>
              </div>
            </div>

            <hr className="border-black/[0.08]" />

            <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-neutral-900">
              <strong className="font-bold">Note du demandeur :</strong>{' '}
              {selectedRequest.detail.note}
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
