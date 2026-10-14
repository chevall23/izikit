import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICING,
  PricingDataSchema,
  customTokenPriceFcfa,
  listingsQuotaLabel,
  planMonthlyTokens,
  planIncludedBoosts,
  planMaxAlerts,
  tokensPerMonthLabel,
  alertsQuotaLabel,
  planMaxListings,
  planPriceFcfa,
  tokenPackPriceFcfa,
  tokenPackTokens,
} from './pricing';

describe('DEFAULT_PRICING', () => {
  it('has the agreed plan prices and quotas', () => {
    expect(planPriceFcfa(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planPriceFcfa(DEFAULT_PRICING, 'PRO_AGENT')).toBe(15_000);
    expect(planPriceFcfa(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(35_000);
    expect(planMaxListings(DEFAULT_PRICING, 'FREE')).toBe(5);
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

  it('rejects a price of 0 for a paid plan', () => {
    for (const key of ['PRO_AGENT', 'AGENCY_PREMIUM'] as const) {
      const bad = clone();
      bad.plans[key].priceFcfa = 0;
      expect(PricingDataSchema.safeParse(bad).success, key).toBe(false);
    }
  });

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

describe('listingsQuotaLabel', () => {
  it('renders the live quota with correct pluralisation', () => {
    expect(listingsQuotaLabel(3)).toBe('3 annonces publiées');
    expect(listingsQuotaLabel(1)).toBe('1 annonce publiée');
    expect(listingsQuotaLabel(null)).toBe('Annonces illimitées');
  });
});

describe('plan entitlements', () => {
  it('defaults to the official grid', () => {
    expect(planMonthlyTokens(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planMonthlyTokens(DEFAULT_PRICING, 'PRO_AGENT')).toBe(10);
    expect(planMonthlyTokens(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(40);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'PRO_AGENT')).toBe(1);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(4);
    expect(planMaxAlerts(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planMaxAlerts(DEFAULT_PRICING, 'PRO_AGENT')).toBe(10);
    expect(planMaxAlerts(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBeNull();
  });

  it('keeps a row stored before this phase valid and fills the grid defaults', () => {
    const legacy = {
      plans: {
        FREE: { priceFcfa: 0, maxActiveListings: 5 },
        PRO_AGENT: { priceFcfa: 17_000, maxActiveListings: 30 },
        AGENCY_PREMIUM: { priceFcfa: 35_000, maxActiveListings: null },
      },
      token: DEFAULT_PRICING.token,
    };
    const parsed = PricingDataSchema.parse(legacy);
    expect(parsed.plans.PRO_AGENT).toMatchObject({
      priceFcfa: 17_000,
      monthlyTokens: 10,
      includedBoosts: 1,
      maxAlerts: 10,
    });
    expect(parsed.plans.AGENCY_PREMIUM).toMatchObject({
      monthlyTokens: 40,
      includedBoosts: 4,
      maxAlerts: null,
    });
  });

  it('rejects negative entitlements', () => {
    const bad = structuredClone(DEFAULT_PRICING);
    bad.plans.PRO_AGENT.monthlyTokens = -1;
    expect(PricingDataSchema.safeParse(bad).success).toBe(false);
  });

  it('labels the perks, hiding zero values', () => {
    expect(tokensPerMonthLabel(0)).toBeNull();
    expect(tokensPerMonthLabel(1)).toBe('1 jeton offert par mois');
    expect(tokensPerMonthLabel(10)).toBe('10 jetons offerts par mois');
    expect(alertsQuotaLabel(0)).toBeNull();
    expect(alertsQuotaLabel(1)).toBe('1 alerte secteur');
    expect(alertsQuotaLabel(10)).toBe('10 alertes secteur');
    expect(alertsQuotaLabel(null)).toBe('Alertes secteur illimitées');
  });
});
