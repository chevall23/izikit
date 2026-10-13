// Server-side authority over what an order costs. The client sends `amount`
// and `metadata`, but for the three priced kinds we recompute the price from
// the live pricing and reject any mismatch, then freeze `priceFcfa` (and the
// token count) into the metadata the webhook will later credit from.
import 'server-only';
import {
  customTokenPriceFcfa,
  planPriceFcfa,
  tokenPackPriceFcfa,
  tokenPackTokens,
  type PricingData,
} from '@/lib/pricing';
import { isPlanKey, SUBSCRIPTION_CURRENCY } from '@/lib/subscription-plans';
import { isTokenPackKey, MAX_CUSTOM_TOKENS, TOKEN_PURCHASE_CURRENCY } from '@/lib/token-packs';

const PRICED_KINDS = new Set([
  'subscription_plan_change',
  'token_purchase',
  'token_purchase_custom',
]);

export function isPricedOrderKind(kind: unknown): boolean {
  return typeof kind === 'string' && PRICED_KINDS.has(kind);
}

export type OrderPricingResult =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; code: 'AMOUNT_MISMATCH' | 'INVALID_ORDER_METADATA'; message: string };

interface OrderPricingInput {
  amount: number;
  currency: string;
  metadata?: Record<string, unknown> | undefined;
}

const invalid = (message: string): OrderPricingResult => ({
  ok: false,
  code: 'INVALID_ORDER_METADATA',
  message,
});
const mismatch = (): OrderPricingResult => ({
  ok: false,
  code: 'AMOUNT_MISMATCH',
  message: 'The amount does not match the current price.',
});

export function resolveOrderPricing(
  pricing: PricingData,
  input: OrderPricingInput,
): OrderPricingResult {
  const meta = input.metadata ?? {};
  const kind = meta.kind;
  if (!isPricedOrderKind(kind)) return { ok: true, metadata: meta };

  if (kind === 'subscription_plan_change') {
    if (!isPlanKey(meta.planKey) || meta.planKey === 'FREE') {
      return invalid('Unknown or non-purchasable plan.');
    }
    if (input.currency !== SUBSCRIPTION_CURRENCY) return invalid('Unsupported currency.');
    const expected = planPriceFcfa(pricing, meta.planKey);
    if (input.amount !== expected) return mismatch();
    return { ok: true, metadata: { ...meta, priceFcfa: expected } };
  }

  if (kind === 'token_purchase') {
    if (!isTokenPackKey(meta.packKey)) return invalid('Unknown token pack.');
    if (input.currency !== TOKEN_PURCHASE_CURRENCY) return invalid('Unsupported currency.');
    const expected = tokenPackPriceFcfa(pricing, meta.packKey);
    if (input.amount !== expected) return mismatch();
    return {
      ok: true,
      metadata: { ...meta, tokens: tokenPackTokens(pricing, meta.packKey), priceFcfa: expected },
    };
  }

  // token_purchase_custom
  const tokens = meta.tokens;
  if (
    typeof tokens !== 'number' ||
    !Number.isInteger(tokens) ||
    tokens < 1 ||
    tokens > MAX_CUSTOM_TOKENS
  ) {
    return invalid(`tokens must be an integer between 1 and ${MAX_CUSTOM_TOKENS}.`);
  }
  if (input.currency !== TOKEN_PURCHASE_CURRENCY) return invalid('Unsupported currency.');
  const expected = customTokenPriceFcfa(pricing, tokens);
  if (input.amount !== expected) return mismatch();
  return { ok: true, metadata: { ...meta, tokens, priceFcfa: expected } };
}
