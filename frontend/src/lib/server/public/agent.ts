// Public agent profile — single source for GET /api/public/agents/[id] and
// the server-rendered /agents/[id] page. Returns null for any user that is
// not accountType=OWNER_AGENT (never leaks a TENANT_BUYER's existence).
// The phone number is returned separately: it is paid information
// (AGENT-CONTACT-01) and only the API route decides whether to reveal it.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { LEGAL_DOCUMENT_TYPE_COUNT } from '@/lib/server/users/enrich';

const RECENT_LISTINGS_LIMIT = 6;

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
  photos: { where: { isPrimary: true }, take: 1, select: { url: true } },
} as const;

export interface PublicAgentProfile {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  phone: string | null;
  contactUnlocked: boolean;
  createdAt: string;
  stats: {
    activeListings: number;
    soldListings: number;
    verifiedDocCount: number;
    verifiedDocTotal: number;
    reviewCount: number;
    ratingAvg: number | null;
  };
  specialties: { propertyTypes: string[]; transactionTypes: string[] };
  listings: {
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
  }[];
}

/** Profile as an anonymous visitor sees it (phone hidden) + the hidden phone. */
export async function loadPublicAgent(
  id: string,
): Promise<{ profile: PublicAgentProfile; phone: string | null } | null> {
  const agent = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      city: true,
      country: true,
      bio: true,
      phone: true,
      accountType: true,
      createdAt: true,
    },
  });
  if (!agent || agent.accountType !== 'OWNER_AGENT') return null;

  const [
    listings,
    activeCount,
    soldCount,
    verifiedDocCount,
    propertyTypes,
    transactionTypes,
    reviewCount,
    reviewAggregate,
  ] = await Promise.all([
    prisma.listing.findMany({
      where: { userId: id, status: 'VERIFIED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_LISTINGS_LIMIT,
      select: LISTING_SELECT,
    }),
    prisma.listing.count({ where: { userId: id, status: 'VERIFIED' } }),
    prisma.listing.count({ where: { userId: id, status: 'SOLD' } }),
    prisma.legalDocument.count({ where: { userId: id, status: 'VERIFIED' } }),
    prisma.listing.groupBy({
      by: ['propertyType'],
      where: { userId: id, status: { in: ['VERIFIED', 'SOLD'] } },
      _count: { _all: true },
    }),
    prisma.listing.groupBy({
      by: ['transactionType'],
      where: { userId: id, status: { in: ['VERIFIED', 'SOLD'] } },
      _count: { _all: true },
    }),
    prisma.agentReview.count({ where: { agentId: id } }),
    prisma.agentReview.aggregate({ where: { agentId: id }, _avg: { rating: true } }),
  ]);

  return {
    phone: agent.phone,
    profile: {
      id: agent.id,
      name: agent.name,
      avatarUrl: agent.avatarUrl,
      city: agent.city,
      country: agent.country,
      bio: agent.bio,
      phone: null,
      contactUnlocked: false,
      createdAt: new Date(agent.createdAt).toISOString(),
      stats: {
        activeListings: activeCount,
        soldListings: soldCount,
        verifiedDocCount,
        verifiedDocTotal: LEGAL_DOCUMENT_TYPE_COUNT,
        reviewCount,
        ratingAvg: reviewAggregate._avg.rating,
      },
      specialties: {
        propertyTypes: propertyTypes.map((r) => r.propertyType),
        transactionTypes: transactionTypes.map((r) => r.transactionType),
      },
      listings: listings.map((l) => ({
        id: l.id,
        title: l.title,
        city: l.city,
        country: l.country,
        propertyType: l.propertyType,
        transactionType: l.transactionType,
        price: l.price,
        currency: l.currency,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        surfaceM2: l.surfaceM2,
        createdAt: new Date(l.createdAt).toISOString(),
        primaryPhotoUrl: l.photos[0]?.url ?? null,
      })),
    },
  };
}
