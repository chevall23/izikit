import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { isPricedOrderKind, resolveOrderPricing } from './order-pricing';

const P = DEFAULT_PRICING;

describe('isPricedOrderKind', () => {
  it('knows the three priced kinds only', () => {
    expect(isPricedOrderKind('subscription_plan_change')).toBe(true);
    expect(isPricedOrderKind('token_purchase')).toBe(true);
    expect(isPricedOrderKind('token_purchase_custom')).toBe(true);
    expect(isPricedOrderKind('anything_else')).toBe(false);
    expect(isPricedOrderKind(undefined)).toBe(false);
  });
});

describe('resolveOrderPricing', () => {
  it('passes untyped orders through untouched', () => {
    const r = resolveOrderPricing(P, { amount: 1000, currency: 'XOF' });
    expect(r).toEqual({ ok: true, metadata: {} });
  });

  it('accepts a plan at its exact price and freezes it', () => {
    const r = resolveOrderPricing(P, {
      amount: 15_000,
      currency: 'XOF',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT', priceFcfa: 15_000 },
    });
  });

  it('rejects a forged plan amount (1 F for PRO_AGENT)', () => {
    const r = resolveOrderPricing(P, {
      amount: 1,
      currency: 'XOF',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('rejects FREE, unknown plans and a non-XOF currency', () => {
    for (const planKey of ['FREE', 'GOLD', undefined]) {
      const r = resolveOrderPricing(P, {
        amount: 0 + 1,
        currency: 'XOF',
        metadata: { kind: 'subscription_plan_change', planKey },
      });
      expect(r).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
    }
    const usd = resolveOrderPricing(P, {
      amount: 15_000,
      currency: 'USD',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(usd).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
  });

  it('freezes pack tokens from the server, ignoring client-supplied tokens', () => {
    const r = resolveOrderPricing(P, {
      amount: 36_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 999_999 },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 150, priceFcfa: 36_000 },
    });
  });

  it('rejects a pack with the wrong amount or an unknown pack', () => {
    expect(
      resolveOrderPricing(P, {
        amount: 100,
        currency: 'XOF',
        metadata: { kind: 'token_purchase', packKey: 'PRO' },
      }),
    ).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
    expect(
      resolveOrderPricing(P, {
        amount: 100,
        currency: 'XOF',
        metadata: { kind: 'token_purchase', packKey: 'NOPE' },
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
  });

  it('prices a custom top-up at the base rate and freezes the count', () => {
    const r = resolveOrderPricing(P, {
      amount: 3_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 10 },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'token_purchase_custom', tokens: 10, priceFcfa: 3_000 },
    });
  });

  it('rejects custom counts that are fractional, negative, zero, huge or not numbers', () => {
    for (const tokens of [1.5, -5, 0, 1001, 1_000_000, '10', null]) {
      const r = resolveOrderPricing(P, {
        amount: 300,
        currency: 'XOF',
        metadata: { kind: 'token_purchase_custom', tokens },
      });
      expect(r, String(tokens)).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
    }
  });

  it('rejects a custom top-up paid below the base rate', () => {
    const r = resolveOrderPricing(P, {
      amount: 10,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 1000 },
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });
});
