// Public listing search — single source for GET /api/public/listings and
// the server-rendered /annonces page. Only VERIFIED listings are ever
// returned. Query params are best-effort: anything malformed is silently
// ignored rather than rejected, since this backs a public navigation page.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { LISTINGS_PAGE_SIZE } from '@/lib/listings';

export const DEFAULT_LIMIT = LISTINGS_PAGE_SIZE;
const MAX_LIMIT = 24;

export interface ListingSearch {
  country?: string | undefined;
  city?: string | undefined;
  propertyType?: string | undefined;
  transactionType?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  page: number;
  limit: number;
  sort: 'recent' | 'price_asc' | 'price_desc';
}

export interface PublicListingItem {
  id: string;
  title: string;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  surfaceM2: number | null;
  createdAt: string;
  primaryPhotoUrl: string | null;
  photoCount: number;
  agent: { name: string | null; avatarUrl: string | null; seed: string };
}

export interface PublicListingsResult {
  items: PublicListingItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  facets: {
    countries: { value: string; count: number; minPrice: number | null }[];
    propertyTypes: { value: string; count: number }[];
    transactionTypes: { value: string; count: number }[];
  };
}

function parsePage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const SORT_ORDER_BY: Record<ListingSearch['sort'], Prisma.ListingOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  price_asc: [{ price: 'asc' }, { id: 'desc' }],
  price_desc: [{ price: 'desc' }, { id: 'desc' }],
};

function parseSort(raw: string | null): ListingSearch['sort'] {
  return raw === 'price_asc' || raw === 'price_desc' ? raw : 'recent';
}

export function parseListingSearch(params: URLSearchParams): ListingSearch {
  return {
    country: params.get('country')?.trim() || undefined,
    city: params.get('city')?.trim() || undefined,
    propertyType: params.get('propertyType')?.trim() || undefined,
    transactionType: params.get('transactionType')?.trim() || undefined,
    priceMin: parsePositiveInt(params.get('priceMin')),
    priceMax: parsePositiveInt(params.get('priceMax')),
    page: parsePage(params.get('page')),
    limit: parseLimit(params.get('limit')),
    sort: parseSort(params.get('sort')),
  };
}

const LISTING_SELECT = {
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
  photos: {
    where: { isPrimary: true },
    take: 1,
    select: { url: true },
  },
  _count: { select: { photos: true } },
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export async function searchPublicListings(q: ListingSearch): Promise<PublicListingsResult> {
  const { country, city, propertyType, transactionType, priceMin, priceMax, page, limit } = q;

  // Builds the Prisma `where` clause. `omit` drops one filter dimension
  // from the clause — used so each facet's own counts aren't collapsed by
  // its own currently-selected value (e.g. filtering by country=Bénin
  // must NOT shrink the country facet list down to just Bénin).
  function buildWhere(
    omit?: 'country' | 'propertyType' | 'transactionType',
  ): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = { status: 'VERIFIED' };
    if (country && omit !== 'country') where.country = country;
    if (propertyType && omit !== 'propertyType') where.propertyType = propertyType;
    if (transactionType && omit !== 'transactionType') where.transactionType = transactionType;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (priceMin !== undefined || priceMax !== undefined) {
      where.price = {
        ...(priceMin !== undefined && { gte: priceMin }),
        ...(priceMax !== undefined && { lte: priceMax }),
      };
    }
    return where;
  }

  const baseWhere = buildWhere();

  const [rows, total, countryFacet, propertyTypeFacet, transactionTypeFacet] = await Promise.all([
    prisma.listing.findMany({
      where: baseWhere,
      orderBy: SORT_ORDER_BY[q.sort],
      skip: (page - 1) * limit,
      take: limit,
      select: LISTING_SELECT,
    }),
    prisma.listing.count({ where: baseWhere }),
    prisma.listing.groupBy({
      by: ['country'],
      where: buildWhere('country'),
      _count: { _all: true },
      _min: { price: true },
    }),
    prisma.listing.groupBy({
      by: ['propertyType'],
      where: buildWhere('propertyType'),
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ['transactionType'],
      where: buildWhere('transactionType'),
      _count: { _all: true },
    }),
  ]);

  const items = rows.map((r) => ({
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
    createdAt: new Date(r.createdAt).toISOString(),
    primaryPhotoUrl: r.photos[0]?.url ?? null,
    photoCount: r._count.photos,
    agent: { name: r.user.name, avatarUrl: r.user.avatarUrl, seed: r.user.id },
  }));

  const toFacet = (rows: { _count: { _all: number } }[], key: string) =>
    rows
      .map((r) => ({
        value: (r as unknown as Record<string, string>)[key]!,
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count);

  const countries = countryFacet
    .map((r) => ({ value: r.country, count: r._count._all, minPrice: r._min.price }))
    .sort((a, b) => b.count - a.count);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    facets: {
      countries,
      propertyTypes: toFacet(propertyTypeFacet, 'propertyType'),
      transactionTypes: toFacet(transactionTypeFacet, 'transactionType'),
    },
  };
}
