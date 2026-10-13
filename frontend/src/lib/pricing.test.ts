import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICING,
  PricingDataSchema,
  customTokenPriceFcfa,
  planMaxListings,
  planPriceFcfa,
  tokenPackPriceFcfa,
  tokenPackTokens,
} from './pricing';

describe('DEFAULT_PRICING', () => {
  it('has the agreed plan prices and quotas', () => {
    expect(planPriceFcfa(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planPriceFcfa(DEFAULT_PRICING, 'PRO_AGENT')).toBe(29_900);
    expect(planPriceFcfa(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(89_900);
    expect(planMaxListings(DEFAULT_PRICING, 'FREE')).toBe(3);
    expect(planMaxListings(DEFAULT_PRICING, 'PRO_AGENT')).toBe(30);
    expect(planMaxListings(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBeNull();
  });

  it('derives pack prices from the 300 F base with volume discounts', () => {
    expect(tokenPackTokens(DEFAULT_PRICING, 'STARTER')).toBe(50);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'STARTER')).toBe(13_500);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'STANDARD')).toBe(36_000);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'PRO')).toBe(75_600);
  });

  it('prices a custom top-up at the base rate', () => {
    expect(customTokenPriceFcfa(DEFAULT_PRICING, 7)).toBe(2_100);
  });

  it('parses against its own schema', () => {
    expect(PricingDataSchema.safeParse(DEFAULT_PRICING).success).toBe(true);
  });
});

describe('PricingDataSchema', () => {
  const clone = () => structuredClone(DEFAULT_PRICING);

  it('rejects a non-zero FREE price', () => {
    const bad = clone();
    (bad.plans.FREE as { priceFcfa: number }).priceFcfa = 100;
    expect(PricingDataSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative prices, fractional quotas and discounts above 90', () => {
    const a = clone();
    a.plans.PRO_AGENT.priceFcfa = -1;
    expect(PricingDataSchema.safeParse(a).success).toBe(false);
    const b = clone();
    b.plans.PRO_AGENT.maxActiveListings = 2.5;
    expect(PricingDataSchema.safeParse(b).success).toBe(false);
    const c = clone();
    c.token.packs.PRO.discountPct = 95;
    expect(PricingDataSchema.safeParse(c).success).toBe(false);
  });

  it('rejects a missing pack and a non-positive token base', () => {
    const a = clone() as unknown as { token: { packs: Record<string, unknown> } };
    delete a.token.packs.STARTER;
    expect(PricingDataSchema.safeParse(a).success).toBe(false);
    const b = clone();
    b.token.baseFcfa = 0;
    expect(PricingDataSchema.safeParse(b).success).toBe(false);
  });

  it('accepts unlimited (null) quotas', () => {
    const ok = clone();
    ok.plans.PRO_AGENT.maxActiveListings = null;
    expect(PricingDataSchema.safeParse(ok).success).toBe(true);
  });
});
