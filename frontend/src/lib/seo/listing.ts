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

const TYPE_PLURAL: Record<string, string> = {
  VILLA: 'Villas',
  APPARTEMENT: 'Appartements',
  PARCELLE: 'Parcelles',
  DOMAINE: 'Domaines',
  MAISON: 'Maisons',
  BOUTIQUE: 'Boutiques',
  BUREAU: 'Bureaux',
  SALLE_FETE: 'Salles de fête',
  SALLE_CONFERENCE: 'Salles de conférence',
  IMMEUBLE: 'Immeubles',
};

const COUNTRY_IN: Record<string, string> = {
  Bénin: 'au Bénin',
  Togo: 'au Togo',
  Sénégal: 'au Sénégal',
  "Côte d'Ivoire": "en Côte d'Ivoire",
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

export interface ListingSeoFields extends ListingSlugFields {
  id: string;
  title: string;
  description: string | null;
  country: string;
  bathrooms: number | null;
  surfaceM2: number | null;
  price: number;
  currency: string;
  createdAt: string | Date;
  photos: { url: string }[];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "500 000 FCFA" (plain spaces — fr-FR uses narrow no-break spaces). */
function formatPrice(price: number, currency: string): string {
  const amount = price.toLocaleString('fr-FR').replace(/\s/g, ' ');
  return `${amount} ${currency === 'XOF' ? 'FCFA' : currency}`;
}

function priceLabel(l: Pick<ListingSeoFields, 'price' | 'currency' | 'transactionType'>) {
  if (l.price < MIN_REAL_PRICE) return null;
  return formatPrice(l.price, l.currency) + (l.transactionType === 'LOCATION' ? '/mois' : '');
}

const PHONE_RE = /\+?\d[\d\s.()-]{6,}\d/g;

function cleanText(text: string): string {
  return text.replace(PHONE_RE, '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** Search-result title built from structured fields (the raw title stays the page's H1). */
export function listingSeoTitle(l: Omit<ListingSeoFields, 'id' | 'title' | 'description'>): string {
  const parts = [capitalize(TYPE_WORD[l.propertyType] ?? 'bien immobilier')];
  if (l.bedrooms && l.bedrooms > 0) parts.push(`${l.bedrooms} chambre${l.bedrooms > 1 ? 's' : ''}`);
  const transaction = TRANSACTION_WORD[l.transactionType];
  if (transaction) parts.push(transaction);
  if (l.city) parts.push(`à ${l.city}`);
  const price = priceLabel(l);
  return parts.join(' ') + (price ? ` — ${price}` : '');
}

export function listingSeoDescription(l: Omit<ListingSeoFields, 'id' | 'title'>): string {
  let lead = capitalize(TYPE_WORD[l.propertyType] ?? 'bien immobilier');
  if (l.bedrooms && l.bedrooms > 0) lead += ` de ${l.bedrooms} chambre${l.bedrooms > 1 ? 's' : ''}`;
  const transaction = TRANSACTION_WORD[l.transactionType];
  if (transaction) lead += ` ${transaction}`;
  if (l.city) lead += ` à ${l.city}`;
  if (l.country) lead += ` (${l.country})`;
  const facts = [
    l.surfaceM2 ? `${l.surfaceM2} m²` : null,
    l.bathrooms ? `${l.bathrooms} salle${l.bathrooms > 1 ? 's' : ''} de bain` : null,
  ].filter(Boolean);
  const price = priceLabel(l);
  const sentences = [
    lead + (facts.length ? `, ${facts.join(', ')}` : '') + '.',
    price ? `Prix : ${price}.` : null,
    l.description ? cleanText(l.description) : null,
  ].filter(Boolean);
  return truncate(sentences.join(' '), 160);
}

export interface ListingSearchFilters {
  propertyType?: string | undefined;
  transactionType?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
}

/** Plain-French name of a listing search ("Appartements à louer à Cotonou"). */
export function listingSearchHeading(f: ListingSearchFilters): string {
  const type = f.propertyType ? TYPE_PLURAL[f.propertyType] : undefined;
  const transaction = f.transactionType ? TRANSACTION_WORD[f.transactionType] : undefined;
  const place = f.city
    ? `à ${f.city}`
    : f.country
      ? (COUNTRY_IN[f.country] ?? `en ${f.country}`)
      : undefined;
  if (!type && !transaction && !place) {
    return "Annonces immobilières au Bénin, au Togo, en Côte d'Ivoire et au Sénégal";
  }
  const head = type ?? (transaction ? 'Biens immobiliers' : 'Annonces immobilières');
  return [head, transaction, place].filter(Boolean).join(' ');
}

/** schema.org RealEstateListing for the detail page. */
export function listingJsonLd(l: ListingSeoFields, url: string) {
  const createdAt = typeof l.createdAt === 'string' ? l.createdAt : l.createdAt.toISOString();
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listingSeoTitle(l),
    description: listingSeoDescription(l),
    url,
    datePosted: createdAt,
    image: l.photos.map((p) => p.url),
    ...(l.price >= MIN_REAL_PRICE && {
      offers: {
        '@type': 'Offer',
        price: l.price,
        priceCurrency: l.currency,
        availability: 'https://schema.org/InStock',
        businessFunction:
          l.transactionType === 'VENTE'
            ? 'https://purl.org/goodrelations/v1#Sell'
            : 'https://purl.org/goodrelations/v1#LeaseOut',
      },
    }),
    contentLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: l.city, addressCountry: l.country },
    },
  };
}
