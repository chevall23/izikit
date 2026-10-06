import { describe, expect, it } from 'vitest';
import { DEFAULT_OG_IMAGE, absoluteUrl, isIndexableHost, pageMetadata } from './site';

describe('isIndexableHost', () => {
  it('only indexes the production domain', () => {
    expect(isIndexableHost('https://habitat-afrik.com')).toBe(true);
    expect(isIndexableHost('https://habitatafrik.izichop.xyz')).toBe(false);
    expect(isIndexableHost('https://www.habitat-afrik.com')).toBe(false);
    expect(isIndexableHost('not a url')).toBe(false);
  });
});

describe('pageMetadata', () => {
  it('fills canonical, Open Graph and Twitter with site defaults', () => {
    const m = pageMetadata({ title: 'Annonces', description: 'Desc', path: '/annonces' });
    expect(m.title).toBe('Annonces');
    expect(m.alternates).toEqual({ canonical: '/annonces' });
    expect(m.openGraph).toMatchObject({
      siteName: 'Habitat-Afrik',
      locale: 'fr_FR',
      url: '/annonces',
      title: 'Annonces | Habitat-Afrik',
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
    });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [DEFAULT_OG_IMAGE] });
    expect(m.robots).toBeUndefined();
  });

  it('uses the page image and can opt out of indexing', () => {
    const m = pageMetadata({
      title: 'Villa',
      description: 'Desc',
      path: '/annonces/villa-x',
      image: { url: 'https://cdn.example/1.webp', alt: 'Villa' },
      noindex: true,
      absoluteTitle: true,
    });
    expect(m.title).toEqual({ absolute: 'Villa' });
    expect(m.openGraph).toMatchObject({ images: [{ url: 'https://cdn.example/1.webp' }] });
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it('drops the brand suffix when it would push the title past 60 characters', () => {
    const title = 'Appartement 1 chambre à louer à Abomey-Calavi — 60 000 FCFA/mois';
    const m = pageMetadata({ title, description: 'Desc', path: '/annonces/x' });
    expect(m.title).toEqual({ absolute: title });
    expect(m.openGraph).toMatchObject({ title });
  });
});

describe('absoluteUrl', () => {
  it('prefixes paths with the site url and keeps absolute urls', () => {
    expect(absoluteUrl('/annonces', 'https://habitat-afrik.com')).toBe(
      'https://habitat-afrik.com/annonces',
    );
    expect(absoluteUrl('annonces', 'https://habitat-afrik.com')).toBe(
      'https://habitat-afrik.com/annonces',
    );
    expect(absoluteUrl('https://cdn.example/x.webp')).toBe('https://cdn.example/x.webp');
  });
});
