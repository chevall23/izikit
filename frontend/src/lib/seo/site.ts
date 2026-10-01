// Site-wide SEO constants. SITE_URL comes from the server's runtime APP_URL
// (https://habitat-afrik.com in production, the izichop subdomain in
// pre-prod) and falls back to the production URL wherever it isn't set
// (client bundles, `next build` prerendering).

export const PRODUCTION_HOST = 'habitat-afrik.com';

export const SITE_URL = (process.env.APP_URL || `https://${PRODUCTION_HOST}`).replace(/\/+$/, '');

export const SITE_NAME = 'Habitat-Afrik';

export const DEFAULT_TITLE =
  "Habitat-Afrik — Annonces immobilières au Bénin, au Togo, en Côte d'Ivoire et au Sénégal";

export const DEFAULT_DESCRIPTION =
  "Maisons, appartements, terrains, bureaux et boutiques à vendre ou à louer au Bénin, au Togo, en Côte d'Ivoire et au Sénégal. Des milliers d'annonces publiées par des agents immobiliers vérifiés.";

export const BRAND_COLOR = '#376bff';

/** True only on the production domain — pre-prod must never be indexed. */
export function isIndexableHost(siteUrl: string = SITE_URL): boolean {
  try {
    return new URL(siteUrl).hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/** Absolute URL on the current site for a path ("/annonces" → "https://…/annonces"). */
export function absoluteUrl(path: string, siteUrl: string = SITE_URL): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}
