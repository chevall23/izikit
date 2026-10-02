// Listing search — the first page of results is rendered on the server so
// search engines see real listings and links; the client component takes
// over for filtering and pagination. Only the unfiltered first page is
// indexable: filtered combinations are served as noindex (the city/type
// landing pages under /immobilier are their indexable counterparts).
import type { Metadata } from 'next';
import { listingSearchHeading } from '@/lib/seo/listing';
import { DEFAULT_DESCRIPTION, pageMetadata } from '@/lib/seo/site';
import {
  parseListingSearch,
  searchPublicListings,
  DEFAULT_LIMIT,
} from '@/lib/server/public/listings';
import { AnnoncesClient } from './AnnoncesClient';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function toUrlParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  return params;
}

const FILTER_KEYS = ['country', 'city', 'propertyType', 'transactionType'] as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = toUrlParams(await searchParams);
  const q = parseListingSearch(params);
  const filtered = FILTER_KEYS.some((k) => q[k]) || q.page > 1 || params.has('sort');
  const heading = listingSearchHeading(q);
  return pageMetadata({
    title: filtered ? heading : 'Annonces immobilières : maisons, terrains, appartements',
    description: filtered
      ? `${heading} : consultez les annonces vérifiées sur Habitat-Afrik, avec photos, prix et contact direct de l'agent.`
      : DEFAULT_DESCRIPTION,
    path: '/annonces',
    noindex: filtered,
  });
}

export default async function AnnoncesPage({ searchParams }: Props) {
  const q = parseListingSearch(toUrlParams(await searchParams));
  // The client always asks for the default page size and sort.
  const search = {
    ...q,
    limit: DEFAULT_LIMIT,
    sort: 'recent' as const,
    priceMin: undefined,
    priceMax: undefined,
  };
  const data = await searchPublicListings(search).catch(() => null);

  return (
    <AnnoncesClient
      initial={{
        filters: {
          country: q.country ?? '',
          city: q.city ?? '',
          propertyType: q.propertyType ?? '',
          transactionType: q.transactionType ?? '',
        },
        page: q.page,
        data,
        heading: listingSearchHeading(q),
      }}
    />
  );
}
