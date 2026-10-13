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
const paidPlan = z.object({
  priceFcfa: z.number().int().nonnegative().max(10_000_000),
  maxActiveListings: quota,
});
const pack = z.object({
  tokens: z.number().int().positive().max(100_000),
  discountPct: z.number().min(0).max(90),
});

export const PricingDataSchema = z.object({
  plans: z.object({
    FREE: z.object({ priceFcfa: z.literal(0), maxActiveListings: quota }),
    PRO_AGENT: paidPlan,
    AGENCY_PREMIUM: paidPlan,
  }),
  token: z.object({
    baseFcfa: z.number().int().positive().max(100_000),
    packs: z.object({ STARTER: pack, STANDARD: pack, PRO: pack }),
  }),
});

export type PricingData = z.infer<typeof PricingDataSchema>;

export const DEFAULT_PRICING: PricingData = {
  plans: {
    FREE: { priceFcfa: 0, maxActiveListings: PLAN_CATALOG.FREE.maxActiveListings },
    PRO_AGENT: {
      priceFcfa: PLAN_CATALOG.PRO_AGENT.priceFcfa,
      maxActiveListings: PLAN_CATALOG.PRO_AGENT.maxActiveListings,
    },
    AGENCY_PREMIUM: {
      priceFcfa: PLAN_CATALOG.AGENCY_PREMIUM.priceFcfa,
      maxActiveListings: PLAN_CATALOG.AGENCY_PREMIUM.maxActiveListings,
    },
  },
  token: {
    baseFcfa: DEFAULT_TOKEN_BASE_FCFA,
    packs: {
      STARTER: { ...DEFAULT_TOKEN_PACKS.STARTER },
      STANDARD: { ...DEFAULT_TOKEN_PACKS.STANDARD },
      PRO: { ...DEFAULT_TOKEN_PACKS.PRO },
    },
  },
};

export function planPriceFcfa(p: PricingData, key: PlanKey): number {
  return p.plans[key].priceFcfa;
}

export function planMaxListings(p: PricingData, key: PlanKey): number | null {
  return p.plans[key].maxActiveListings;
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
