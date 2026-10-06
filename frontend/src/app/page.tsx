import type { Metadata } from 'next';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, pageMetadata, siteJsonLd } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/JsonLd';
import { searchPublicListings } from '@/lib/server/public/listings';
import { searchPublicAgents } from '@/lib/server/public/agents';
import { popularSearchLinks } from '@/lib/server/public/landing';
import { HomeClient } from './HomeClient';
import { FEATURED_LISTINGS_LIMIT, HOME_AGENTS_LIMIT } from './home-config';

// Featured listings, top agents and popular searches are rendered on the
// server so the home page — the site's strongest page — links to them in
// its HTML (the build has no DB access, hence per-request rendering).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/',
  absoluteTitle: true,
});

export default async function HomePage() {
  const [listings, agents, popularSearches] = await Promise.all([
    searchPublicListings({ page: 1, limit: FEATURED_LISTINGS_LIMIT, sort: 'recent' }).catch(
      () => null,
    ),
    searchPublicAgents(new URLSearchParams({ limit: String(HOME_AGENTS_LIMIT), sort: 'listings' }))
      .then((r) => r.items)
      .catch(() => null),
    popularSearchLinks().catch(() => []),
  ]);

  return (
    <>
      {siteJsonLd().map((data) => (
        <JsonLd key={data['@type']} data={data} />
      ))}
      <HomeClient initial={{ listings, agents, popularSearches }} />
    </>
  );
}
