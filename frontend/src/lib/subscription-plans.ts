// Single source of truth for the 3 subscription plans (Banani "Abonnement &
// Paiement" screen). Shared between the API routes (validate `planKey`,
// resolve the charge amount) and the settings UI (render the plan cards) so
// price/features never drift between what's charged and what's displayed.
// No secrets here — safe to import from client components.

export const PLAN_KEYS = ['FREE', 'PRO_AGENT', 'AGENCY_PREMIUM'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export type StatsLevel = 'BASIC' | 'FULL' | 'ADVANCED';

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  description: string;
  priceFcfa: number; // 0 for the free plan; smallest currency unit (FCFA has no decimals)
  maxActiveListings: number | null; // null = unlimited
  monthlyTokens: number; // tokens granted on every paid subscription period
  includedBoosts: number; // 7-day boosts included per period (consumed by phase 1B)
  maxPhotosPerListing: number; // photos allowed on one listing
  maxAlerts: number | null; // active sector alerts for agent accounts; null = unlimited
  statsLevel: StatsLevel; // what /statistiques shows and allows (see lib/server/stats/level.ts)
  // Static perks only — the listing-quota line is generated from the live
  // pricing (see listingsQuotaLabel in lib/pricing.ts).
  features: string[];
}

export const SUBSCRIPTION_CURRENCY = 'XOF';

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  FREE: {
    key: 'FREE',
    label: 'Gratuit',
    description: 'Pour démarrer et tester la plateforme',
    priceFcfa: 0,
    maxActiveListings: 5,
    monthlyTokens: 0,
    includedBoosts: 0,
    maxPhotosPerListing: 3,
    maxAlerts: 0,
    statsLevel: 'BASIC',
    features: ['Statistiques basiques'],
  },
  PRO_AGENT: {
    key: 'PRO_AGENT',
    label: 'Pro Agent',
    description: 'Pour les agents actifs avec un portefeuille établi',
    priceFcfa: 15_000,
    maxActiveListings: 30,
    monthlyTokens: 10,
    includedBoosts: 1,
    maxPhotosPerListing: 20,
    maxAlerts: 10,
    statsLevel: 'FULL',
    features: ['Statistiques complètes'],
  },
  AGENCY_PREMIUM: {
    key: 'AGENCY_PREMIUM',
    label: 'Agence Premium',
    description: 'Pour les agences à fort volume et multi-agents',
    priceFcfa: 35_000,
    maxActiveListings: null,
    monthlyTokens: 40,
    includedBoosts: 4,
    maxPhotosPerListing: 20,
    maxAlerts: null,
    statsLevel: 'ADVANCED',
    features: ['Statistiques avancées'],
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}
