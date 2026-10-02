import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/server/prisma';
import { MIN_REAL_PRICE, listingPath } from '@/lib/seo/listing';
import { absoluteUrl } from '@/lib/seo/site';

// Built from the database on each request (the build has no DB access).
export const dynamic = 'force-dynamic';

const STATIC_PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/annonces', priority: 0.9 },
  { path: '/agents', priority: 0.7 },
  { path: '/blog', priority: 0.6 },
  { path: '/demande-immobiliere', priority: 0.5 },
  { path: '/contact', priority: 0.4 },
  { path: '/a-propos', priority: 0.3 },
  { path: '/cgu', priority: 0.1 },
  { path: '/confidentialite', priority: 0.1 },
  { path: '/mentions-legales', priority: 0.1 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, agents, articles] = await Promise.all([
    // Thin listings (placeholder price, no photo) are left out — see isThinListing.
    prisma.listing.findMany({
      where: { status: 'VERIFIED', price: { gte: MIN_REAL_PRICE }, photos: { some: {} } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        propertyType: true,
        transactionType: true,
        city: true,
        bedrooms: true,
        updatedAt: true,
      },
    }),
    // Agent profiles without a single live listing are thin content.
    prisma.user.findMany({
      where: { accountType: 'OWNER_AGENT', listings: { some: { status: 'VERIFIED' } } },
      select: { id: true, updatedAt: true },
    }),
    prisma.blogArticle.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  return [
    ...STATIC_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      changeFrequency: 'daily' as const,
      priority: p.priority,
    })),
    ...listings.map((l) => ({
      url: absoluteUrl(listingPath(l)),
      lastModified: l.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...agents.map((a) => ({
      url: absoluteUrl(`/agents/${a.id}`),
      lastModified: a.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...articles.map((a) => ({
      url: absoluteUrl(`/blog/${a.slug}`),
      lastModified: a.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
