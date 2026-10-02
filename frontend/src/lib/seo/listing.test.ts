import { describe, expect, it } from 'vitest';
import { isThinListing, listingIdFromParam, listingPath, listingSlug, slugify } from './listing';

describe('slugify', () => {
  it('lowercases, strips accents and collapses separators', () => {
    expect(slugify("  Salle de fête à Abomey-Calavi / Côte d'Ivoire !! ")).toBe(
      'salle-de-fete-a-abomey-calavi-cote-d-ivoire',
    );
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(50) + ' ' + 'b'.repeat(50), 60);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('listingSlug', () => {
  it('builds the slug from structured fields, never the free-text title', () => {
    expect(
      listingSlug({
        propertyType: 'APPARTEMENT',
        transactionType: 'LOCATION',
        city: 'Cotonou',
        bedrooms: 3,
      }),
    ).toBe('appartement-3-chambres-a-louer-cotonou');
    expect(
      listingSlug({
        propertyType: 'MAISON',
        transactionType: 'LOCATION',
        city: 'Lomé',
        bedrooms: 1,
      }),
    ).toBe('maison-1-chambre-a-louer-lome');
    expect(
      listingSlug({
        propertyType: 'PARCELLE',
        transactionType: 'VENTE',
        city: 'Lomé',
        bedrooms: null,
      }),
    ).toBe('parcelle-a-vendre-lome');
  });

  it('falls back to a generic word for unknown types', () => {
    expect(listingSlug({ propertyType: 'X', transactionType: 'Y', city: '', bedrooms: null })).toBe(
      'bien-immobilier',
    );
  });
});

describe('listingPath / listingIdFromParam', () => {
  const listing = {
    id: 'cmabc123xyz',
    propertyType: 'VILLA',
    transactionType: 'VENTE',
    city: 'Porto-Novo',
    bedrooms: 4,
  };

  it('puts the id after the slug', () => {
    expect(listingPath(listing)).toBe('/annonces/villa-4-chambres-a-vendre-porto-novo-cmabc123xyz');
  });

  it('reads the id back from a slugged or bare param', () => {
    expect(listingIdFromParam('villa-4-chambres-a-vendre-porto-novo-cmabc123xyz')).toBe(
      'cmabc123xyz',
    );
    expect(listingIdFromParam('cmabc123xyz')).toBe('cmabc123xyz');
    expect(listingIdFromParam('')).toBeNull();
    expect(listingIdFromParam('a-b-')).toBeNull();
  });
});

describe('isThinListing', () => {
  it('flags placeholder prices and photo-less listings', () => {
    expect(isThinListing({ price: 1, photoCount: 5 })).toBe(true);
    expect(isThinListing({ price: 150_000, photoCount: 0 })).toBe(true);
    expect(isThinListing({ price: 150_000, photoCount: 2 })).toBe(false);
  });
});
