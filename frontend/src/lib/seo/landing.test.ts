import { describe, expect, it } from 'vitest';
import { landingPath, offerSlug, parseLandingSegments, parseOfferSlug } from './landing';

describe('offer slugs', () => {
  it('round-trips type, transaction and both', () => {
    expect(parseOfferSlug('appartement-a-louer')).toEqual({
      propertyType: 'APPARTEMENT',
      transactionType: 'LOCATION',
    });
    expect(parseOfferSlug('terrain')).toEqual({ propertyType: 'PARCELLE' });
    expect(parseOfferSlug('a-vendre')).toEqual({ transactionType: 'VENTE' });
    expect(parseOfferSlug('salle-de-fete-a-louer')).toEqual({
      propertyType: 'SALLE_FETE',
      transactionType: 'LOCATION',
    });
    expect(parseOfferSlug('cotonou')).toBeNull();
    expect(offerSlug({ propertyType: 'PARCELLE', transactionType: 'VENTE' })).toBe(
      'terrain-a-vendre',
    );
    expect(offerSlug({ transactionType: 'LOCATION' })).toBe('a-louer');
    expect(offerSlug({})).toBeNull();
  });
});

describe('landingPath', () => {
  it('orders country / city / offer and slugifies the city', () => {
    expect(landingPath({ country: "Côte d'Ivoire" })).toBe('/immobilier/cote-d-ivoire');
    expect(
      landingPath({
        country: 'Bénin',
        city: 'Abomey-Calavi',
        propertyType: 'MAISON',
        transactionType: 'LOCATION',
      }),
    ).toBe('/immobilier/benin/abomey-calavi/maison-a-louer');
    expect(landingPath({ country: 'Togo', transactionType: 'VENTE' })).toBe(
      '/immobilier/togo/a-vendre',
    );
  });
});

describe('parseLandingSegments', () => {
  it('recognises country, city and offer segments', () => {
    expect(parseLandingSegments(['benin'])).toEqual({ country: 'Bénin' });
    expect(parseLandingSegments(['benin', 'cotonou'])).toEqual({
      country: 'Bénin',
      citySlug: 'cotonou',
    });
    expect(parseLandingSegments(['benin', 'villa-a-vendre'])).toEqual({
      country: 'Bénin',
      propertyType: 'VILLA',
      transactionType: 'VENTE',
    });
    expect(parseLandingSegments(['senegal', 'dakar', 'a-louer'])).toEqual({
      country: 'Sénégal',
      citySlug: 'dakar',
      transactionType: 'LOCATION',
    });
  });

  it('rejects unknown countries and malformed paths', () => {
    expect(parseLandingSegments([])).toBeNull();
    expect(parseLandingSegments(['france'])).toBeNull();
    expect(parseLandingSegments(['benin', 'cotonou', 'pas-une-offre'])).toBeNull();
    expect(parseLandingSegments(['benin', 'a', 'b', 'c'])).toBeNull();
  });
});
