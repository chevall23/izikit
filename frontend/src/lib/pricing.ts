// Live pricing shape + pure price helpers. Client-safe (no server-only): the
// server reads the row from PricingConfig (lib/server/pricing), the browser
// reads GET /api/pricing; both fall back to DEFAULT_PRICING.
import { z } from 'zod';
import { PLAN_CATALOG, type PlanKey } from './subscription-plans';
import {
  DEFAULT_TOKEN_BASE_FCFA,
  DEFAULT_TOKEN_PACKS,
  packPriceFcfa,
  type TokenPackKey,
} from './token-packs';

const quota = z.number().int().nonnegative().nullable(); // null = unlimited
// Missing fields on a row stored before these existed fall back to the official
// grid (never to 0), so an old PricingConfig row stays valid and keeps its prices.
const entitlements = (key: PlanKey) => ({
  monthlyTokens: z
    .number()
    .int()
    .nonnegative()
    .max(100_000)
    .default(PLAN_CATALOG[key].monthlyTokens),
  includedBoosts: z
    .number()
    .int()
    .nonnegative()
    .max(1_000)
    .default(PLAN_CATALOG[key].includedBoosts),
  maxAlerts: quota.default(PLAN_CATALOG[key].maxAlerts),
  maxPhotosPerListing: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(PLAN_CATALOG[key].maxPhotosPerListing),
});
const paidPlan = (key: PlanKey) =>
  z.object({
    priceFcfa: z.number().int().positive().max(10_000_000),
    maxActiveListings: quota,
    ...entitlements(key),
  });
const pack = z.object({
  tokens: z.number().int().positive().max(100_000),
  discountPct: z.number().min(0).max(90),
});

export const BOOST_DAYS = [7, 15, 30] as const;
export type BoostDays = (typeof BOOST_DAYS)[number];

const DEFAULT_BOOST = { tokens7: 8, tokens15: 14, tokens30: 24 };
const boostPrices = z.object({
  tokens7: z.number().int().positive().max(100_000),
  tokens15: z.number().int().positive().max(100_000),
  tokens30: z.number().int().positive().max(100_000),
});

const DEFAULT_LEAD = { tokensStandard: 3, tokensUrgent: 5 };
const leadPrices = z.object({
  tokensStandard: z.number().int().positive().max(100_000),
  tokensUrgent: z.number().int().positive().max(100_000),
});

export const PricingDataSchema = z.object({
  plans: z.object({
    FREE: z.object({
      priceFcfa: z.literal(0),
      maxActiveListings: quota,
      ...entitlements('FREE'),
    }),
    PRO_AGENT: paidPlan('PRO_AGENT'),
    AGENCY_PREMIUM: paidPlan('AGENCY_PREMIUM'),
  }),
  token: z.object({
    baseFcfa: z.number().int().positive().max(100_000),
    packs: z.object({ STARTER: pack, STANDARD: pack, PRO: pack }),
  }),
  boost: boostPrices.default(DEFAULT_BOOST),
  lead: leadPrices.default(DEFAULT_LEAD),
});

export type PricingData = z.infer<typeof PricingDataSchema>;

const fromCatalog = (key: PlanKey) => ({
  priceFcfa: PLAN_CATALOG[key].priceFcfa,
  maxActiveListings: PLAN_CATALOG[key].maxActiveListings,
  monthlyTokens: PLAN_CATALOG[key].monthlyTokens,
  includedBoosts: PLAN_CATALOG[key].includedBoosts,
  maxAlerts: PLAN_CATALOG[key].maxAlerts,
  maxPhotosPerListing: PLAN_CATALOG[key].maxPhotosPerListing,
});

export const DEFAULT_PRICING: PricingData = {
  plans: {
    FREE: { ...fromCatalog('FREE'), priceFcfa: 0 },
    PRO_AGENT: fromCatalog('PRO_AGENT'),
    AGENCY_PREMIUM: fromCatalog('AGENCY_PREMIUM'),
  },
  token: {
    baseFcfa: DEFAULT_TOKEN_BASE_FCFA,
    packs: {
      STARTER: { ...DEFAULT_TOKEN_PACKS.STARTER },
      STANDARD: { ...DEFAULT_TOKEN_PACKS.STANDARD },
      PRO: { ...DEFAULT_TOKEN_PACKS.PRO },
    },
  },
  boost: { ...DEFAULT_BOOST },
  lead: { ...DEFAULT_LEAD },
};

export function planPriceFcfa(p: PricingData, key: PlanKey): number {
  return p.plans[key].priceFcfa;
}

export function planMaxListings(p: PricingData, key: PlanKey): number | null {
  return p.plans[key].maxActiveListings;
}

export function listingsQuotaLabel(max: number | null): string {
  if (max === null) return 'Annonces illimitées';
  return `${max} annonce${max > 1 ? 's' : ''} publiée${max > 1 ? 's' : ''}`;
}

export function planMonthlyTokens(p: PricingData, key: PlanKey): number {
  return p.plans[key].monthlyTokens;
}

export function planIncludedBoosts(p: PricingData, key: PlanKey): number {
  return p.plans[key].includedBoosts;
}

export function planMaxAlerts(p: PricingData, key: PlanKey): number | null {
  return p.plans[key].maxAlerts;
}

export function planMaxPhotos(p: PricingData, key: PlanKey): number {
  return p.plans[key].maxPhotosPerListing;
}

export function photosPerListingLabel(max: number): string {
  return `${max} photo${max > 1 ? 's' : ''} par annonce`;
}

export function tokensPerMonthLabel(n: number): string | null {
  if (n <= 0) return null;
  return `${n} jeton${n > 1 ? 's' : ''} offert${n > 1 ? 's' : ''} par mois`;
}

export function alertsQuotaLabel(max: number | null): string | null {
  if (max === null) return 'Alertes secteur illimitées';
  if (max <= 0) return null;
  return `${max} alerte${max > 1 ? 's' : ''} secteur`;
}

export function boostTokenCost(p: PricingData, days: BoostDays): number {
  return days === 7 ? p.boost.tokens7 : days === 15 ? p.boost.tokens15 : p.boost.tokens30;
}

export function leadTokenCost(p: PricingData, priority: string): number {
  return priority === 'Urgent' ? p.lead.tokensUrgent : p.lead.tokensStandard;
}

export function boostsIncludedLabel(n: number): string | null {
  if (n <= 0) return null;
  return `${n} boost${n > 1 ? 's' : ''} de 7 jours inclus`;
}

export function tokenPackTokens(p: PricingData, key: TokenPackKey): number {
  return p.token.packs[key].tokens;
}

export function tokenPackPriceFcfa(p: PricingData, key: TokenPackKey): number {
  const cfg = p.token.packs[key];
  return packPriceFcfa(cfg.tokens, p.token.baseFcfa, cfg.discountPct);
}

export function customTokenPriceFcfa(p: PricingData, tokens: number): number {
  return tokens * p.token.baseFcfa;
}
