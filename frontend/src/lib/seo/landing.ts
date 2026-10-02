// Indexable landing pages /immobilier/<pays>[/<ville>][/<offre>] — the
// crawlable, keyword-rich counterpart of the /annonces filters. Pure URL
// mapping; the city slug is resolved against the database by the page.
import { slugify } from './listing';

export const COUNTRY_BY_SLUG: Record<string, string> = {
  benin: 'Bénin',
  togo: 'Togo',
  'cote-d-ivoire': "Côte d'Ivoire",
  senegal: 'Sénégal',
};

const TYPE_BY_SLUG: Record<string, string> = {
  villa: 'VILLA',
  appartement: 'APPARTEMENT',
  terrain: 'PARCELLE',
  domaine: 'DOMAINE',
  maison: 'MAISON',
  boutique: 'BOUTIQUE',
  bureau: 'BUREAU',
  'salle-de-fete': 'SALLE_FETE',
  'salle-de-conference': 'SALLE_CONFERENCE',
  immeuble: 'IMMEUBLE',
};

const TRANSACTION_BY_SLUG: Record<string, string> = {
  'a-vendre': 'VENTE',
  'a-louer': 'LOCATION',
  sejour: 'SEJOUR',
};

const invert = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const SLUG_BY_TYPE = invert(TYPE_BY_SLUG);
const SLUG_BY_TRANSACTION = invert(TRANSACTION_BY_SLUG);

export const LANDING_TYPES = Object.values(TYPE_BY_SLUG);
export const LANDING_TRANSACTIONS = Object.values(TRANSACTION_BY_SLUG);

export interface Offer {
  propertyType?: string | undefined;
  transactionType?: string | undefined;
}

export function parseOfferSlug(slug: string): Offer | null {
  const transactionSlug = Object.keys(TRANSACTION_BY_SLUG).find(
    (t) => slug === t || slug.endsWith(`-${t}`),
  );
  const typeSlug = transactionSlug ? slug.slice(0, -transactionSlug.length - 1) : slug;
  if (transactionSlug && slug === transactionSlug) {
    return { transactionType: TRANSACTION_BY_SLUG[transactionSlug]! };
  }
  const propertyType = TYPE_BY_SLUG[typeSlug];
  if (!propertyType) return null;
  return {
    propertyType,
    ...(transactionSlug && { transactionType: TRANSACTION_BY_SLUG[transactionSlug]! }),
  };
}

export function offerSlug(o: Offer): string | null {
  const type = o.propertyType ? SLUG_BY_TYPE[o.propertyType] : undefined;
  const transaction = o.transactionType ? SLUG_BY_TRANSACTION[o.transactionType] : undefined;
  if (type && transaction) return `${type}-${transaction}`;
  return type ?? transaction ?? null;
}

export interface LandingTarget extends Offer {
  country: string;
  city?: string | undefined;
}

export function countrySlug(country: string): string {
  return slugify(country);
}

export function landingPath(t: LandingTarget): string {
  const parts = ['/immobilier', countrySlug(t.country)];
  if (t.city) parts.push(slugify(t.city));
  const offer = offerSlug(t);
  if (offer) parts.push(offer);
  return parts.join('/');
}

export interface ParsedLanding extends Offer {
  country: string;
  citySlug?: string;
}

export function parseLandingSegments(segments: string[]): ParsedLanding | null {
  const [countryPart, ...rest] = segments;
  const country = countryPart ? COUNTRY_BY_SLUG[countryPart] : undefined;
  if (!country || rest.length > 2) return null;
  if (rest.length === 0) return { country };
  if (rest.length === 1) {
    const offer = parseOfferSlug(rest[0]!);
    return offer ? { country, ...offer } : { country, citySlug: rest[0]! };
  }
  const offer = parseOfferSlug(rest[1]!);
  return offer ? { country, citySlug: rest[0]!, ...offer } : null;
}
