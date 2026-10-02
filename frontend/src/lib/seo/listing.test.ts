import { describe, expect, it } from 'vitest';
import {
  isThinListing,
  listingIdFromParam,
  listingJsonLd,
  listingPath,
  listingSeoDescription,
  listingSeoTitle,
  listingSlug,
  slugify,
} from './listing';

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

const detail = {
  id: 'cmabc123xyz',
  title: 'BELLE VILLA A VENDRE APPELEZ 97 00 00 00',
  description: 'Villa neuve, appelez le +229 97 00 00 00 pour visiter. Quartier calme.',
  propertyType: 'VILLA',
  transactionType: 'LOCATION',
  city: 'Cotonou',
  country: 'Bénin',
  bedrooms: 4,
  bathrooms: 3,
  surfaceM2: 250,
  price: 500_000,
  currency: 'XOF',
  createdAt: '2026-09-01T10:00:00.000Z',
  photos: [{ url: 'https://cdn.example/1.webp' }, { url: 'https://cdn.example/2.webp' }],
};

describe('listingSeoTitle', () => {
  it('uses structured fields and a per-month price for rentals', () => {
    expect(listingSeoTitle(detail)).toBe('Villa 4 chambres à louer à Cotonou — 500 000 FCFA/mois');
  });

  it('drops placeholder prices', () => {
    expect(listingSeoTitle({ ...detail, transactionType: 'VENTE', price: 1, bedrooms: null })).toBe(
      'Villa à vendre à Cotonou',
    );
  });
});

describe('listingSeoDescription', () => {
  it('summarises the listing, strips phone numbers and stays under 160 chars', () => {
    const d = listingSeoDescription(detail);
    expect(d.startsWith('Villa de 4 chambres à louer à Cotonou (Bénin)')).toBe(true);
    expect(d).toContain('250 m²');
    expect(d).not.toMatch(/97 00/);
    expect(d.length).toBeLessThanOrEqual(160);
  });
});

describe('listingJsonLd', () => {
  it('describes the listing as a RealEstateListing with an offer', () => {
    const ld = listingJsonLd(detail, 'https://habitat-afrik.com/annonces/x-cmabc123xyz');
    expect(ld['@type']).toBe('RealEstateListing');
    expect(ld.url).toBe('https://habitat-afrik.com/annonces/x-cmabc123xyz');
    expect(ld.image).toEqual(['https://cdn.example/1.webp', 'https://cdn.example/2.webp']);
    expect(ld.offers).toMatchObject({ '@type': 'Offer', price: 500_000, priceCurrency: 'XOF' });
  });
});

describe('isThinListing', () => {
  it('flags placeholder prices and photo-less listings', () => {
    expect(isThinListing({ price: 1, photoCount: 5 })).toBe(true);
    expect(isThinListing({ price: 150_000, photoCount: 0 })).toBe(true);
    expect(isThinListing({ price: 150_000, photoCount: 2 })).toBe(false);
  });
});
