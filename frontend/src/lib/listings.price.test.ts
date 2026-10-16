import { describe, it, expect } from 'vitest';
import { formatListingPrice, formatPublicListingPrice } from './listings';

describe('formatPublicListingPrice', () => {
  it.each([0, 1, 999])('hides the placeholder price %i', (price) => {
    expect(formatPublicListingPrice(price, 'XOF')).toBe('Prix sur demande');
  });

  it('shows a real price like formatListingPrice', () => {
    expect(formatPublicListingPrice(35_000, 'XOF')).toBe(formatListingPrice(35_000, 'XOF'));
    expect(formatPublicListingPrice(1000, 'XOF')).toBe(formatListingPrice(1000, 'XOF'));
  });
});
