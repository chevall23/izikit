import { describe, it, expect } from 'vitest';
import {
  CUSTOM_TOKEN_PRICE_FCFA,
  TOKEN_PACK_CATALOG,
  TOKEN_PACK_KEYS,
  customTokenPurchasePriceFcfa,
  isTokenPackKey,
  packPriceFcfa,
} from './token-packs';

describe('token-packs catalog', () => {
  it('has one definition per key with matching tokens/price', () => {
    for (const key of TOKEN_PACK_KEYS) {
      const pack = TOKEN_PACK_CATALOG[key];
      expect(pack.key).toBe(key);
      expect(pack.tokens).toBeGreaterThan(0);
      expect(pack.priceFcfa).toBeGreaterThan(0);
    }
  });

  it('isTokenPackKey accepts only known keys', () => {
    expect(isTokenPackKey('STANDARD')).toBe(true);
    expect(isTokenPackKey('FREE')).toBe(false);
    expect(isTokenPackKey(undefined)).toBe(false);
    expect(isTokenPackKey(123)).toBe(false);
  });
});

describe('token pricing defaults', () => {
  it('uses a single 300 F base rate for custom top-ups', () => {
    expect(CUSTOM_TOKEN_PRICE_FCFA).toBe(300);
    expect(customTokenPurchasePriceFcfa(10)).toBe(3_000);
  });

  it('packs are never more expensive per token than the base rate', () => {
    for (const key of TOKEN_PACK_KEYS) {
      const pack = TOKEN_PACK_CATALOG[key];
      expect(pack.priceFcfa / pack.tokens).toBeLessThan(CUSTOM_TOKEN_PRICE_FCFA);
    }
  });

  it('packPriceFcfa rounds to an integer', () => {
    expect(packPriceFcfa(50, 300, 10)).toBe(13_500);
    expect(Number.isInteger(packPriceFcfa(3, 333, 7))).toBe(true);
  });
});
