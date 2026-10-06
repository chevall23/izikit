// Data for the /immobilier landing pages and their sitemap entries.
// Only VERIFIED listings count; listings imported without a city
// ("À préciser") never produce a city page.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { listingSearchHeading, slugify } from '@/lib/seo/listing';
import {
  COUNTRY_BY_SLUG,
  LANDING_TRANSACTIONS,
  LANDING_TYPES,
  landingPath,
} from '@/lib/seo/landing';
import type { PublicListingItem } from '@/lib/server/public/listings';

const UNKNOWN_CITY = 'À préciser';
export const LANDING_PAGE_SIZE = 24;
/** Below this many listings a combination is not worth a sitemap entry / indexing. */
export const LANDING_MIN_LISTINGS = 3;

export interface LandingFilter {
  country: string;
  city?: string | undefined;
  propertyType?: string | undefined;
  transactionType?: string | undefined;
}

function where(f: LandingFilter): Prisma.ListingWhereInput {
  return {
    status: 'VERIFIED',
    country: f.country,
    ...(f.city ? { city: f.city } : { city: { not: UNKNOWN_CITY } }),
    ...(f.propertyType && { propertyType: f.propertyType }),
    ...(f.transactionType && { transactionType: f.transactionType }),
  };
}

/** The real city name behind a URL slug (null when no live listing uses it). */
export async function resolveCitySlug(country: string, citySlug: string): Promise<string | null> {
  const cities = await prisma.listing.groupBy({
    by: ['city'],
    where: { status: 'VERIFIED', country, city: { not: UNKNOWN_CITY } },
    _count: { _all: true },
    orderBy: { _count: { city: 'desc' } },
  });
  return cities.find((c) => slugify(c.city) === citySlug)?.city ?? null;
}

export async function loadLanding(f: LandingFilter, page: number) {
  const w = where(f);
  const [rows, total, cities, types, transactions] = await Promise.all([
    prisma.listing.findMany({
      where: w,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * LANDING_PAGE_SIZE,
      take: LANDING_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        city: true,
        country: true,
        propertyType: true,
        transactionType: true,
        price: true,
        currency: true,
        bedrooms: true,
        bathrooms: true,
        surfaceM2: true,
        createdAt: true,
        photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
        _count: { select: { photos: true } },
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.listing.count({ where: w }),
    // Internal-linking facets: sibling cities (same country + offer),
    // and the types / transactions available at this location.
    prisma.listing.groupBy({
      by: ['city'],
      where: where({ ...f, city: undefined }),
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 30,
    }),
    prisma.listing.groupBy({
      by: ['propertyType'],
      where: where({ ...f, propertyType: undefined }),
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ['transactionType'],
      where: where({ ...f, transactionType: undefined }),
      _count: { _all: true },
    }),
  ]);

  const items: PublicListingItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    city: r.city,
    country: r.country,
    propertyType: r.propertyType,
    transactionType: r.transactionType,
    price: r.price,
    currency: r.currency,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    surfaceM2: r.surfaceM2,
    createdAt: r.createdAt.toISOString(),
    primaryPhotoUrl: r.photos[0]?.url ?? null,
    photoCount: r._count.photos,
    agent: { name: r.user.name, avatarUrl: r.user.avatarUrl, seed: r.user.id },
  }));

  return {
    items,
    total,
    totalPages: Math.max(1, Math.ceil(total / LANDING_PAGE_SIZE)),
    cities: cities.map((c) => ({ value: c.city, count: c._count._all })),
    // Only values that have a landing URL (e.g. no AUBERGE page).
    types: types
      .filter((t) => LANDING_TYPES.includes(t.propertyType))
      .map((t) => ({ value: t.propertyType, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    transactions: transactions
      .filter((t) => LANDING_TRANSACTIONS.includes(t.transactionType))
      .map((t) => ({ value: t.transactionType, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Every combination with enough listings to deserve a sitemap entry. */
export async function landingSitemapTargets(): Promise<LandingFilter[]> {
  return (await landingCounts()).map((e) => e.filter);
}

/**
 * The most-stocked city searches ("Appartements à louer à Cotonou"), for the
 * "Recherches populaires" internal-linking block: city-level pages with a
 * full offer first (the long-tail queries), padded with plain city pages.
 */
export async function popularLandingTargets(
  limit = 12,
): Promise<{ filter: LandingFilter; count: number }[]> {
  const entries = (await landingCounts()).filter((e) => e.filter.city);
  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  const offers = entries
    .filter((e) => e.filter.propertyType && e.filter.transactionType)
    .sort(byCount);
  const cities = entries
    .filter((e) => !e.filter.propertyType && !e.filter.transactionType)
    .sort(byCount);
  return [...offers.slice(0, limit - 4), ...cities.slice(0, 4)];
}

/** popularLandingTargets as ready-to-render links (label + landing URL). */
export async function popularSearchLinks(limit = 12) {
  return (await popularLandingTargets(limit)).map(({ filter, count }) => ({
    href: landingPath(filter),
    label: listingSearchHeading(filter),
    count,
  }));
}

async function landingCounts(): Promise<{ filter: LandingFilter; count: number }[]> {
  const groups = await prisma.listing.groupBy({
    by: ['country', 'city', 'propertyType', 'transactionType'],
    where: { status: 'VERIFIED', city: { not: UNKNOWN_CITY } },
    _count: { _all: true },
  });

  const counts = new Map<string, { filter: LandingFilter; count: number }>();
  const add = (filter: LandingFilter, n: number) => {
    const key = JSON.stringify(filter);
    const entry = counts.get(key) ?? { filter, count: 0 };
    entry.count += n;
    counts.set(key, entry);
  };
  const countries = new Set(Object.values(COUNTRY_BY_SLUG));
  for (const g of groups) {
    const n = g._count._all;
    const { country, city } = g;
    if (!countries.has(country)) continue;
    // Values without a landing URL (e.g. AUBERGE) only count towards the
    // broader pages, never produce their own.
    const propertyType = LANDING_TYPES.includes(g.propertyType) ? g.propertyType : null;
    const transactionType = LANDING_TRANSACTIONS.includes(g.transactionType)
      ? g.transactionType
      : null;
    for (const c of [undefined, city]) {
      add({ country, city: c }, n);
      if (propertyType) add({ country, city: c, propertyType }, n);
      if (transactionType) add({ country, city: c, transactionType }, n);
      if (propertyType && transactionType) {
        add({ country, city: c, propertyType, transactionType }, n);
      }
    }
  }
  return [...counts.values()].filter((e) => e.count >= LANDING_MIN_LISTINGS);
}
