import type { MetadataRoute } from 'next';
import { PRIVATE_PATH_PREFIXES } from '@/lib/seo/private-paths';
import { SITE_URL, absoluteUrl, isIndexableHost } from '@/lib/seo/site';

// Read APP_URL at request time: the same build serves the pre-production
// host, which must stay out of search engines entirely.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableHost()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // robots.txt rules are prefix matches: '/admin' also covers '/admin/…'.
      disallow: [...PRIVATE_PATH_PREFIXES],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  };
}
