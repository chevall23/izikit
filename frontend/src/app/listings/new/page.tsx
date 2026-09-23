'use client';

import { ListingForm } from '../_form/ListingForm';

export default function PublishListingPage() {
  return <ListingForm mode={{ kind: 'create' }} />;
}
