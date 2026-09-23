'use client';

import { useParams } from 'next/navigation';
import { ListingForm } from '../../_form/ListingForm';

export default function EditListingPage() {
  const params = useParams<{ id: string }>();
  return <ListingForm mode={{ kind: 'edit', listingId: params.id }} />;
}
