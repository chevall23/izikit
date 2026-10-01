import { describe, expect, it } from 'vitest';
import { absoluteUrl, isIndexableHost } from './site';

describe('isIndexableHost', () => {
  it('only indexes the production domain', () => {
    expect(isIndexableHost('https://habitat-afrik.com')).toBe(true);
    expect(isIndexableHost('https://habitatafrik.izichop.xyz')).toBe(false);
    expect(isIndexableHost('https://www.habitat-afrik.com')).toBe(false);
    expect(isIndexableHost('not a url')).toBe(false);
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
