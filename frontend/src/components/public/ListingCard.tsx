// Server-renderable listing card (landing pages). Same look as the cards of
// the /annonces grid, without the client-side state.
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { ListingImage } from '@/components/public/ListingImage';
import { PROPERTY_TYPE_LABEL, TRANSACTION_TYPE_LABEL, formatListingPrice } from '@/lib/listings';
import { MIN_REAL_PRICE, listingPath } from '@/lib/seo/listing';
import type { PublicListingItem } from '@/lib/server/public/listings';

export function ListingCard({ listing }: { listing: PublicListingItem }) {
  const facts = [
    listing.bedrooms ? `${listing.bedrooms} ch.` : null,
    listing.bathrooms ? `${listing.bathrooms} sdb` : null,
    listing.surfaceM2 ? `${listing.surfaceM2} m²` : null,
  ].filter(Boolean);
  return (
    <article className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
      <Link href={listingPath(listing)} className="relative block h-[200px] bg-gray-100">
        {listing.primaryPhotoUrl && (
          <ListingImage
            src={listing.primaryPhotoUrl}
            alt={listing.title}
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-800">
          {TRANSACTION_TYPE_LABEL[listing.transactionType] ?? listing.transactionType}
        </span>
      </Link>
      <div className="p-4">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">
          {PROPERTY_TYPE_LABEL[listing.propertyType] ?? listing.propertyType}
        </p>
        <h2 className="mt-1 line-clamp-2 text-[15px] font-bold text-neutral-900">
          <Link href={listingPath(listing)}>{listing.title}</Link>
        </h2>
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-gray-500">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {listing.city}, {listing.country}
        </p>
        {facts.length > 0 && <p className="mt-1 text-[13px] text-gray-500">{facts.join(' · ')}</p>}
        <p className="mt-3 text-[17px] font-extrabold text-neutral-900">
          {listing.price >= MIN_REAL_PRICE
            ? formatListingPrice(listing.price, listing.currency) +
              (listing.transactionType === 'LOCATION' ? ' /mois' : '')
            : 'Prix sur demande'}
        </p>
      </div>
    </article>
  );
}
