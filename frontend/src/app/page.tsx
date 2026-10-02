import type { Metadata } from 'next';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, pageMetadata, siteJsonLd } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/JsonLd';
import { HomeClient } from './HomeClient';

export const metadata: Metadata = pageMetadata({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/',
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <>
      {siteJsonLd().map((data) => (
        <JsonLd key={data['@type']} data={data} />
      ))}
      <HomeClient />
    </>
  );
}
