import { describe, expect, it } from 'vitest';
import { requestBarSummary } from './request-bar';

const empty = { propertyType: '', transactionType: '', country: '', city: '' };

describe('requestBarSummary', () => {
  it('falls back to a villa in Cotonou for a purchase', () => {
    const { label, href } = requestBarSummary(empty);
    expect(label).toBe('Villa à Cotonou, achat');
    const q = new URL(href, 'http://x').searchParams;
    expect(q.get('propertyType')).toBe('VILLA');
    expect(q.get('transactionType')).toBe('VENTE');
    expect(q.get('country')).toBe('Bénin');
    expect(q.get('city')).toBe('Cotonou');
  });

  it('follows the home search selection', () => {
    const { label, href } = requestBarSummary({
      propertyType: 'APPARTEMENT',
      transactionType: 'LOCATION',
      country: 'Togo',
      city: 'Lomé',
    });
    expect(label).toBe('Appartement à Lomé, location');
    expect(new URL(href, 'http://x').searchParams.get('country')).toBe('Togo');
  });

  it('uses the first city of a country picked without a city', () => {
    const { label } = requestBarSummary({ ...empty, country: 'Togo' });
    expect(label.startsWith('Villa à ')).toBe(true);
    expect(label).not.toContain('Cotonou');
  });

  it('ignores unknown values', () => {
    expect(
      requestBarSummary({ ...empty, propertyType: 'CHATEAU', transactionType: 'X' }).label,
    ).toBe('Villa à Cotonou, achat');
  });
});
