// Site-wide SEO constants. SITE_URL comes from the server's runtime APP_URL
// (https://habitat-afrik.com in production, the izichop subdomain in
// pre-prod) and falls back to the production URL wherever it isn't set
// (client bundles, `next build` prerendering).

import type { Metadata } from 'next';

export const PRODUCTION_HOST = 'habitat-afrik.com';

export const SITE_URL = (process.env.APP_URL || `https://${PRODUCTION_HOST}`).replace(/\/+$/, '');

export const SITE_NAME = 'Habitat-Afrik';

export const DEFAULT_TITLE = "Habitat-Afrik : immobilier au Bénin, Togo, Côte d'Ivoire, Sénégal";

// Kept under ~155 characters so search results show it whole.
export const DEFAULT_DESCRIPTION =
  "Maisons, appartements, terrains et bureaux à vendre ou à louer au Bénin, au Togo, en Côte d'Ivoire et au Sénégal, publiés par des agents vérifiés.";

export const BRAND_COLOR = '#376bff';

/** True only on the production domain — pre-prod must never be indexed. */
export function isIndexableHost(siteUrl: string = SITE_URL): boolean {
  try {
    return new URL(siteUrl).hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/** Official social accounts (carried over from the legacy site footer). */
export const SOCIAL_PROFILES = [
  'https://www.facebook.com/Habitat-AFRIK-110443520892443',
  'https://www.instagram.com/habitatafrik/',
  'https://twitter.com/HabitatAfrik',
];

/** schema.org Organization + WebSite (with the listing search box) for the home page. */
export function siteJsonLd(siteUrl: string = SITE_URL) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: SITE_NAME,
      url: `${siteUrl}/`,
      logo: `${siteUrl}/icon-512.png`,
      sameAs: SOCIAL_PROFILES,
      areaServed: ['Bénin', 'Togo', "Côte d'Ivoire", 'Sénégal'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: SITE_NAME,
      url: `${siteUrl}/`,
      inLanguage: 'fr',
      publisher: { '@id': `${siteUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/annonces?city={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

/** Default share image (app/api/og/route.tsx). */
export const DEFAULT_OG_IMAGE = '/api/og';

export interface PageSeo {
  title: string;
  description: string;
  /** Site path, used as canonical and og:url (resolved against metadataBase). */
  path: string;
  image?: { url: string; alt?: string };
  noindex?: boolean;
  /** Skip the "| Habitat-Afrik" suffix (titles that already carry enough). */
  absoluteTitle?: boolean;
  type?: 'website' | 'article';
}

/**
 * Complete page metadata. Next merges metadata shallowly — a page-level
 * `openGraph` replaces the layout's whole object — so every public page
 * builds its own with the site defaults through this helper.
 */
/** Search results cut titles around this length; the brand suffix is dropped rather than truncated. */
const MAX_TITLE_LENGTH = 60;

export function pageMetadata(p: PageSeo): Metadata {
  const suffixed = `${p.title} | ${SITE_NAME}`;
  const absolute = p.absoluteTitle || suffixed.length > MAX_TITLE_LENGTH;
  const fullTitle = absolute ? p.title : suffixed;
  const images = p.image
    ? [{ url: p.image.url, ...(p.image.alt && { alt: p.image.alt }) }]
    : [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }];
  return {
    title: absolute ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: p.path },
    ...(p.noindex && { robots: { index: false, follow: true } }),
    openGraph: {
      type: p.type ?? 'website',
      siteName: SITE_NAME,
      locale: 'fr_FR',
      url: p.path,
      title: fullTitle,
      description: p.description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: p.description,
      images: images.map((i) => i.url),
    },
  };
}

/** Absolute URL on the current site for a path ("/annonces" → "https://…/annonces"). */
export function absoluteUrl(path: string, siteUrl: string = SITE_URL): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}
