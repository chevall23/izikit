import type { MetadataRoute } from 'next';
import { BRAND_COLOR, DEFAULT_DESCRIPTION, SITE_NAME } from '@/lib/seo/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    lang: 'fr',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND_COLOR,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
