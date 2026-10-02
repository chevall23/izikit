// SEO helpers for listing pages: URL slug, canonical path and the "thin
// listing" rule. Slugs are built from structured fields (type, rooms,
// transaction, city) — never from the free-text title, which on imported
// listings often holds capitals, phone numbers or "1 FCFA" prices.

const TYPE_WORD: Record<string, string> = {
  VILLA: 'villa',
  APPARTEMENT: 'appartement',
  PARCELLE: 'parcelle',
  DOMAINE: 'domaine',
  MAISON: 'maison',
  BOUTIQUE: 'boutique',
  BUREAU: 'bureau',
  SALLE_FETE: 'salle de fête',
  SALLE_CONFERENCE: 'salle de conférence',
  IMMEUBLE: 'immeuble',
};

const TRANSACTION_WORD: Record<string, string> = {
  VENTE: 'à vendre',
  LOCATION: 'à louer',
  SEJOUR: 'meublé en séjour',
  AUBERGE: 'auberge',
};

/** Below this price (FCFA) a listing is a placeholder ("1 FCFA", "0"), not a real offer. */
export const MIN_REAL_PRICE = 1000;

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}

export interface ListingSlugFields {
  propertyType: string;
  transactionType: string;
  city: string;
  bedrooms: number | null;
}

export function listingSlug(l: ListingSlugFields): string {
  const parts = [TYPE_WORD[l.propertyType] ?? 'bien immobilier'];
  if (l.bedrooms && l.bedrooms > 0) {
    parts.push(`${l.bedrooms} chambre${l.bedrooms > 1 ? 's' : ''}`);
  }
  const transaction = TRANSACTION_WORD[l.transactionType];
  if (transaction) parts.push(transaction);
  if (l.city) parts.push(l.city);
  return slugify(parts.join(' '));
}

export function listingPath(l: ListingSlugFields & { id: string }): string {
  return `/annonces/${listingSlug(l)}-${l.id}`;
}

/** The listing id is the last `-` segment of the URL param (cuids contain no dash). */
export function listingIdFromParam(param: string): string | null {
  const id = param.slice(param.lastIndexOf('-') + 1);
  return /^[a-z0-9]+$/i.test(id) ? id : null;
}

/** Thin listings stay reachable but are kept out of the index and the sitemap. */
export function isThinListing(l: { price: number; photoCount: number }): boolean {
  return l.price < MIN_REAL_PRICE || l.photoCount === 0;
}
