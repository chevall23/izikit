// Single source of truth for the token packs (Banani "Jetons & visites
// virtuelles" screen). These are the DEFAULTS: the live values come from
// PricingConfig (see lib/pricing.ts + lib/server/pricing). Shared between the
// purchase button (client) and the webhook (server). No secrets here — safe to
// import from client components. Mirrors frontend/src/lib/subscription-plans.ts.

export const TOKEN_PACK_KEYS = ['STARTER', 'STANDARD', 'PRO'] as const;
export type TokenPackKey = (typeof TOKEN_PACK_KEYS)[number];

export interface TokenPackDefinition {
  key: TokenPackKey;
  label: string;
  tokens: number;
  priceFcfa: number; // smallest currency unit; XOF has no decimals
}

export const TOKEN_PURCHASE_CURRENCY = 'XOF';

// One base rate; every pack price is derived from it by a volume discount.
export const DEFAULT_TOKEN_BASE_FCFA = 300;

// Hard cap on a custom top-up, so a forged request cannot ask for millions.
export const MAX_CUSTOM_TOKENS = 1000;

export function packPriceFcfa(tokens: number, baseFcfa: number, discountPct: number): number {
  return Math.round(tokens * baseFcfa * (1 - discountPct / 100));
}

export const DEFAULT_TOKEN_PACKS: Record<TokenPackKey, { tokens: number; discountPct: number }> = {
  STARTER: { tokens: 50, discountPct: 10 },
  STANDARD: { tokens: 150, discountPct: 20 },
  PRO: { tokens: 350, discountPct: 28 },
};

const LABELS: Record<TokenPackKey, string> = {
  STARTER: 'Starter',
  STANDARD: 'Standard',
  PRO: 'Pro',
};

function defaultPack(key: TokenPackKey): TokenPackDefinition {
  const { tokens, discountPct } = DEFAULT_TOKEN_PACKS[key];
  return {
    key,
    label: LABELS[key],
    tokens,
    priceFcfa: packPriceFcfa(tokens, DEFAULT_TOKEN_BASE_FCFA, discountPct),
  };
}

export const TOKEN_PACK_CATALOG: Record<TokenPackKey, TokenPackDefinition> = {
  STARTER: defaultPack('STARTER'),
  STANDARD: defaultPack('STANDARD'),
  PRO: defaultPack('PRO'),
};

export function isTokenPackKey(value: unknown): value is TokenPackKey {
  return typeof value === 'string' && (TOKEN_PACK_KEYS as readonly string[]).includes(value);
}

// Default per-token rate for a custom top-up — a custom purchase of N tokens
// costs exactly N * this.
export const CUSTOM_TOKEN_PRICE_FCFA = DEFAULT_TOKEN_BASE_FCFA;

export function customTokenPurchasePriceFcfa(tokens: number): number {
  return tokens * CUSTOM_TOKEN_PRICE_FCFA;
}
