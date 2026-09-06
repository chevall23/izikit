import { Coins, Percent, Save, Pencil, Home, Building2, Map, Briefcase } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminSettingsTabs } from '@/components/admin/AdminSettingsTabs';
import { AdminSettingsSection, AdminSettingsButton } from '@/components/admin/AdminSettingsSection';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminPricingCard } from '@/components/admin/AdminPricingCard';
import { AdminHistoryRow } from '@/components/admin/AdminHistoryRow';

// ── Static mockup data (Banani "Tarification Admin") ───────────────────────────

const TOKEN_PRICING = [
  { flag: '🇧🇯', country: 'Bénin', unit: '500 FCFA', pack10: '4 500 FCFA', pack50: '21 000 FCFA' },
  { flag: '🇹🇬', country: 'Togo', unit: '500 FCFA', pack10: '4 500 FCFA', pack50: '20 000 FCFA' },
  {
    flag: '🇨🇮',
    country: "Côte d'Ivoire",
    unit: '600 FCFA',
    pack10: '5 500 FCFA',
    pack50: '25 000 FCFA',
  },
  { flag: '🇸🇳', country: 'Sénégal', unit: '550 FCFA', pack10: '5 000 FCFA', pack50: '22 000 FCFA' },
];

const COMMISSIONS = [
  {
    icon: Home,
    type: 'Villa',
    transaction: 'Vente' as const,
    rate: '3,5 %',
    since: '01 jan. 2025',
  },
  {
    icon: Home,
    type: 'Villa',
    transaction: 'Location' as const,
    rate: '2,5 %',
    since: '01 jan. 2025',
  },
  {
    icon: Building2,
    type: 'Appartement',
    transaction: 'Vente' as const,
    rate: '4,0 %',
    since: '15 fév. 2025',
  },
  {
    icon: Building2,
    type: 'Appartement',
    transaction: 'Location' as const,
    rate: '3,0 %',
    since: '15 fév. 2025',
  },
  {
    icon: Map,
    type: 'Terrain',
    transaction: 'Vente' as const,
    rate: '5,0 %',
    since: '01 jan. 2025',
  },
  {
    icon: Briefcase,
    type: 'Bureau',
    transaction: 'Location' as const,
    rate: '3,5 %',
    since: '01 mars 2025',
  },
];

const BOOST_PACKS = [
  {
    name: 'Boost 7 jours',
    duration: 'Durée : 1 semaine',
    price: '2 500',
    features: [
      { label: 'Mise en avant dans les résultats', included: true },
      { label: 'Badge "Boosté" sur l\'annonce', included: true },
      { label: 'Notifications push ciblées', included: true },
      { label: 'Position top de page', included: false },
    ],
  },
  {
    name: 'Boost 15 jours',
    duration: 'Durée : 2 semaines',
    price: '4 000',
    featured: true,
    features: [
      { label: 'Mise en avant dans les résultats', included: true },
      { label: 'Badge "Boosté" sur l\'annonce', included: true },
      { label: 'Notifications push ciblées', included: true },
      { label: 'Position top de page', included: true },
    ],
  },
  {
    name: 'Boost 30 jours',
    duration: 'Durée : 1 mois',
    price: '7 000',
    features: [
      { label: 'Mise en avant dans les résultats', included: true },
      { label: 'Badge "Boosté" sur l\'annonce', included: true },
      { label: 'Notifications push ciblées', included: true },
      { label: 'Position top de page', included: true },
    ],
  },
];

const HISTORY = [
  {
    field: "Prix jeton · Côte d'Ivoire",
    from: '550 FCFA',
    to: '600 FCFA',
    authorName: 'Kofi Mensah',
    authorAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F3',
    time: 'Il y a 2h',
    latest: true,
  },
  {
    field: 'Commission · Appartement · Vente',
    from: '3,5 %',
    to: '4,0 %',
    authorName: 'Awa Diallo',
    authorAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F1',
    time: '15 fév. 2025',
  },
  {
    field: 'Boost 30 jours',
    from: '6 000 FCFA',
    to: '7 000 FCFA',
    authorName: 'Kofi Mensah',
    authorAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F35-50%2FAfrican%2F3',
    time: '10 fév. 2025',
  },
  {
    field: 'Pack 50 jetons · Sénégal',
    from: '20 000 FCFA',
    to: '22 000 FCFA',
    authorName: 'Awa Diallo',
    authorAvatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F1',
    time: '01 jan. 2025',
  },
];

// ── Page (UI mockup only — no backend wiring) ───────────────────────────────────

export default function AdminTarificationPage() {
  return (
    <AdminShell
      active="settings"
      searchPlaceholder="Rechercher une annonce, un utilisateur, un paiement…"
    >
      <div>
        <p className="text-[12px] font-semibold text-brand">Paramètres · Tarification</p>
        <h1 className="font-sora mt-1 text-2xl leading-tight font-bold text-neutral-900">
          Tarification
        </h1>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <AdminSettingsTabs active="pricing" />

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdminStatCard
              icon={<Coins className="h-[18px] w-[18px] text-brand" aria-hidden />}
              label="Prix moyen du jeton"
              value="500"
              unit="FCFA"
              sub="Moyenne pondérée sur 4 pays"
            />
            <AdminStatCard
              icon={<Percent className="h-[18px] w-[18px] text-brand" aria-hidden />}
              label="Commission moyenne"
              value="3,5"
              unit="%"
              sub="Toutes transactions confondues"
            />
          </div>

          {/* Prix des jetons par pays */}
          <AdminSettingsSection
            title="Prix des jetons par pays"
            description="Définissez le prix unitaire et les packs par pays. Cliquez sur l'icône crayon pour modifier."
            bodyClassName="overflow-x-auto"
            headerRight={
              <AdminSettingsButton icon={<Save className="h-3.5 w-3.5" aria-hidden />}>
                Tout enregistrer
              </AdminSettingsButton>
            }
          >
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  {['Pays', 'Devise', 'Prix unitaire', 'Pack 10 jetons', 'Pack 50 jetons', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {TOKEN_PRICING.map((row, i) => (
                  <tr
                    key={row.country}
                    className={`border-t border-black/[0.05] ${i % 2 === 0 ? '' : 'bg-gray-50/60'}`}
                  >
                    <td className="px-3.5 py-2.5 text-[13px] whitespace-nowrap">
                      <span className="mr-1.5">{row.flag}</span>
                      <span className="font-semibold text-neutral-900">{row.country}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <AdminStatusBadge tone="neutral">XOF</AdminStatusBadge>
                    </td>
                    {[row.unit, row.pack10, row.pack50].map((v, j) => (
                      <td key={j} className="px-3.5 py-2.5">
                        <input
                          defaultValue={v}
                          className="h-8 w-full min-w-[90px] rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand"
                        />
                      </td>
                    ))}
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Modifier les tarifs — ${row.country}`}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand/10"
                        >
                          <Pencil className="h-[13px] w-[13px] text-brand" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="h-7 flex-shrink-0 rounded-md bg-brand px-2.5 text-[12px] font-semibold whitespace-nowrap text-brand-foreground"
                        >
                          Sauv.
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminSettingsSection>

          {/* Commissions par type de transaction */}
          <AdminSettingsSection
            title="Commissions par type de transaction"
            description="Taux appliqués selon le type de bien et de transaction"
            bodyClassName="overflow-x-auto"
            headerRight={
              <AdminSettingsButton icon={<Save className="h-3.5 w-3.5" aria-hidden />}>
                Enregistrer
              </AdminSettingsButton>
            }
          >
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="bg-gray-50">
                  {['Type de bien', 'Transaction', 'Taux de commission', 'Appliqué depuis', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {COMMISSIONS.map((row, i) => (
                  <tr
                    key={`${row.type}-${row.transaction}`}
                    className={`border-t border-black/[0.05] ${i % 2 === 0 ? '' : 'bg-gray-50/60'}`}
                  >
                    <td className="px-3.5 py-2.5 text-[13px] whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <row.icon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                        {row.type}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <AdminStatusBadge tone={row.transaction === 'Vente' ? 'primary' : 'warning'}>
                        {row.transaction}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <input
                        defaultValue={row.rate}
                        className="h-8 w-[90px] rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand"
                      />
                    </td>
                    <td className="px-3.5 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {row.since}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <button
                        type="button"
                        aria-label={`Modifier la commission — ${row.type} ${row.transaction}`}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand/10"
                      >
                        <Pencil className="h-[13px] w-[13px] text-brand" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminSettingsSection>

          {/* Boost & mise en avant */}
          <AdminSettingsSection
            title="Boost & mise en avant"
            description="Tarifs des packs de mise en avant des annonces"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {BOOST_PACKS.map((pack) => (
                <AdminPricingCard key={pack.name} {...pack} currency="FCFA" />
              ))}
            </div>
          </AdminSettingsSection>

          {/* Historique des modifications */}
          <AdminSettingsSection
            title="Historique des modifications"
            description="Derniers changements apportés à la tarification"
            headerRight={<AdminStatusBadge tone="neutral">8 entrées</AdminStatusBadge>}
            bodyClassName=""
          >
            <div className="flex flex-col">
              {HISTORY.map((h) => (
                <AdminHistoryRow key={h.field + h.time} {...h} />
              ))}
            </div>
          </AdminSettingsSection>
        </div>
      </div>
    </AdminShell>
  );
}
