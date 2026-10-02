// Public listing detail — single source for GET /api/public/listings/[id]
// and the server-rendered /annonces/[slug] page. Only VERIFIED listings are
// returned (null otherwise, so callers never leak a non-public listing).
// Side effects (view counter, geocoding) stay in the API route: the page is
// also fetched by crawlers, which must not inflate the counters.
import 'server-only';
import { prisma } from '@/lib/server/prisma';

const LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  landmark: true,
  city: true,
  country: true,
  propertyType: true,
  transactionType: true,
  price: true,
  currency: true,
  surfaceM2: true,
  capacity: true,
  yearBuilt: true,
  standing: true,
  roomsTotal: true,
  bedrooms: true,
  bathrooms: true,
  kitchens: true,
  amenities: true,
  status: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  photos: {
    orderBy: { position: 'asc' as const },
    select: { url: true, isPrimary: true },
  },
  user: { select: { id: true, name: true, avatarUrl: true, phone: true } },
} as const;

const SIMILAR_SELECT = {
  id: true,
  title: true,
  city: true,
  country: true,
  propertyType: true,
  transactionType: true,
  price: true,
  currency: true,
  bedrooms: true,
  createdAt: true,
  photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
  _count: { select: { photos: true } },
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export interface PublicSimilarListing {
  id: string;
  title: string;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  bedrooms: number | null;
  createdAt: string;
  primaryPhotoUrl: string | null;
  photoCount: number;
  agent: { name: string | null; avatarUrl: string | null; seed: string };
}

export interface PublicListingDetail {
  id: string;
  title: string;
  description: string | null;
  landmark: string | null;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  currency: string;
  surfaceM2: number | null;
  capacity: number | null;
  yearBuilt: number | null;
  standing: string | null;
  roomsTotal: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  kitchens: number | null;
  amenities: string[];
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  photos: { url: string; isPrimary: boolean }[];
  agent: { name: string | null; avatarUrl: string | null; phone: string | null; seed: string };
  location: { lat: number; lon: number } | null;
  similar: PublicSimilarListing[];
}

export async function getPublicListing(id: string): Promise<PublicListingDetail | null> {
  const listing = await prisma.listing.findUnique({ where: { id }, select: LISTING_SELECT });
  if (!listing || listing.status !== 'VERIFIED') return null;

  const similarRows = await prisma.listing.findMany({
    where: {
      status: 'VERIFIED',
      country: listing.country,
      propertyType: listing.propertyType,
      id: { not: id },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 3,
    select: SIMILAR_SELECT,
  });

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    landmark: listing.landmark,
    city: listing.city,
    country: listing.country,
    propertyType: listing.propertyType,
    transactionType: listing.transactionType,
    price: listing.price,
    currency: listing.currency,
    surfaceM2: listing.surfaceM2,
    capacity: listing.capacity,
    yearBuilt: listing.yearBuilt,
    standing: listing.standing,
    roomsTotal: listing.roomsTotal,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    kitchens: listing.kitchens,
    amenities: (listing.amenities as string[]) ?? [],
    viewCount: listing.viewCount,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    photos: listing.photos,
    agent: {
      name: listing.user.name,
      avatarUrl: listing.user.avatarUrl,
      phone: listing.user.phone,
      seed: listing.user.id,
    },
    location: null,
    similar: similarRows.map((r) => ({
      id: r.id,
      title: r.title,
      city: r.city,
      country: r.country,
      propertyType: r.propertyType,
      transactionType: r.transactionType,
      price: r.price,
      currency: r.currency,
      bedrooms: r.bedrooms,
      createdAt: r.createdAt.toISOString(),
      primaryPhotoUrl: r.photos[0]?.url ?? null,
      photoCount: r._count.photos,
      agent: { name: r.user.name, avatarUrl: r.user.avatarUrl, seed: r.user.id },
    })),
  };
}
