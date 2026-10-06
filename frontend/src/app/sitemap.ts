import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/server/prisma';
import { MIN_REAL_PRICE, listingPath } from '@/lib/seo/listing';
import { absoluteUrl } from '@/lib/seo/site';
import { landingPath } from '@/lib/seo/landing';
import { landingSitemapTargets } from '@/lib/server/public/landing';

// Built from the database on each request (the build has no DB access).
export const dynamic = 'force-dynamic';

// `feed` pages list content: their lastModified is the newest item they
// show. The others (forms, legal pages) carry no date rather than a fake one.
const STATIC_PAGES: {
  path: string;
  priority: number;
  feed?: 'listings' | 'agents' | 'articles';
}[] = [
  { path: '/', priority: 1, feed: 'listings' },
  { path: '/annonces', priority: 0.9, feed: 'listings' },
  { path: '/agents', priority: 0.7, feed: 'agents' },
  { path: '/blog', priority: 0.6, feed: 'articles' },
  { path: '/demande-immobiliere', priority: 0.5 },
  { path: '/contact', priority: 0.4 },
  { path: '/a-propos', priority: 0.3 },
  { path: '/cgu', priority: 0.1 },
  { path: '/confidentialite', priority: 0.1 },
  { path: '/mentions-legales', priority: 0.1 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, agents, articles, landings] = await Promise.all([
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
    landingSitemapTargets(),
  ]);

  const newest = (dates: Date[]) =>
    dates.reduce<Date | undefined>((max, d) => (!max || d > max ? d : max), undefined);
  const feedDate = {
    listings: listings[0]?.updatedAt,
    agents: newest(agents.map((a) => a.updatedAt)),
    articles: newest(articles.map((a) => a.updatedAt)),
  };

  return [
    ...STATIC_PAGES.map((p) => {
      const lastModified = p.feed ? feedDate[p.feed] : undefined;
      return {
        url: absoluteUrl(p.path),
        ...(lastModified && { lastModified }),
        changeFrequency: p.feed ? ('daily' as const) : ('monthly' as const),
        priority: p.priority,
      };
    }),
    // Two spellings of a city ("Lomé" / "Lome") share one slug and one page.
    ...[...new Map(landings.map((t) => [landingPath(t), t])).entries()].map(([path, t]) => ({
      url: absoluteUrl(path),
      changeFrequency: 'daily' as const,
      priority: t.city ? 0.7 : 0.8,
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
