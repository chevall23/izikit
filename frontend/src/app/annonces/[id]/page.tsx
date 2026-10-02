// Listing detail — rendered on the server so search engines and link
// previews (WhatsApp, Facebook) get the full content, title, description,
// share image and structured data. The URL param is "<slug>-<id>"; any other
// form (bare id from old links, outdated slug) is permanently redirected to
// the canonical URL.
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { getPublicListing } from '@/lib/server/public/listing';
import {
  isThinListing,
  listingIdFromParam,
  listingJsonLd,
  listingPath,
  listingSeoDescription,
  listingSeoTitle,
} from '@/lib/seo/listing';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AnnonceDetailClient } from './AnnonceDetailClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

// generateMetadata and the page share one DB round trip per request.
const loadListing = cache(async (param: string) => {
  const id = listingIdFromParam(param);
  return id ? getPublicListing(id) : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: param } = await params;
  const listing = await loadListing(param);
  if (!listing) return { title: 'Annonce introuvable', robots: { index: false } };

  const image = listing.photos.find((p) => p.isPrimary)?.url ?? listing.photos[0]?.url;
  return pageMetadata({
    title: listingSeoTitle(listing),
    description: listingSeoDescription(listing),
    path: listingPath(listing),
    type: 'article',
    ...(image && { image: { url: image, alt: listing.title } }),
    noindex: isThinListing({ price: listing.price, photoCount: listing.photos.length }),
  });
}

export default async function AnnonceDetailPage({ params }: Props) {
  const { id: param } = await params;
  const listing = await loadListing(param);
  if (!listing) notFound();

  const canonical = listingPath(listing);
  if (`/annonces/${param}` !== canonical) permanentRedirect(canonical);

  const url = absoluteUrl(canonical);
  return (
    <>
      <JsonLd data={listingJsonLd(listing, url)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Accueil', url: absoluteUrl('/') },
          { name: 'Annonces', url: absoluteUrl('/annonces') },
          { name: listingSeoTitle(listing), url },
        ])}
      />
      <AnnonceDetailClient initialListing={listing} />
    </>
  );
}
