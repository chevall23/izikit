import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { PRIVATE_PATH_PREFIXES } from './src/lib/seo/private-paths';

// Static security headers applied to every response.
// Set via next.config.ts (not middleware.ts) so the CDN edge can serve them
// from cache without invoking a function — zero per-request latency.
//
// CSP ships in two layers (see securityHeaders): an enforced policy limited
// to directives that cannot break a page, and the full policy as
// Report-Only. A strict script-src would need a per-request nonce
// (middleware) — revisit once the Report-Only violations are understood.
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  // 'unsafe-inline': Next's inline bootstrap + the analytics snippets (no nonce yet).
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net",
  // Google Maps embeds on listing / agent pages.
  'frame-src https://www.google.com https://www.googletagmanager.com',
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Enforced CSP: only the directives that cannot break a page (no framing
  // of our pages, no plugins, no <base> hijack, no mixed content).
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
  },
  // Full policy in observation mode: browsers report violations (DevTools
  // console) without blocking anything. GTM injects third-party tags, so
  // watch the reports before promoting this to the enforced header.
  { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Standalone output bundles a self-contained server.js + minimal node_modules
  // into .next/standalone. Consumed by the PlanetHoster N0C deployment: the
  // Passenger entrypoint (repo-root app.js) requires ./frontend/server.js from
  // this bundle. No impact on `next dev` / `next start`.
  output: 'standalone',
  // TODO(next16): Next 16 no longer reads this `eslint` key at build time
  // (it logs "Unrecognized key 'eslint'"). Lint is already enforced by the
  // husky pre-commit hook + `pnpm lint` in CI, so this block is inert — move
  // to an ESLint-in-CI-only setup and delete it. Left in place for now to
  // avoid a config change outside this migration's scope.
  eslint: {
    // Lint already runs via the husky pre-commit hook (lint-staged) and
    // `pnpm lint` in CI. Next's build-time lint step loads the repo-root
    // flat config (eslint.config.mjs), whose deps (@eslint/js,
    // typescript-eslint, globals) live only in the root package.json —
    // unreachable from a build scoped to the `frontend` package, which
    // breaks `next build` with ERR_MODULE_NOT_FOUND.
    ignoreDuringBuilds: true,
  },
  // Listing / article photos go through the Next image optimizer (resized,
  // cached on our server, served from our domain). WebP only: AVIF encoding
  // is too CPU-hungry for the shared host. Originals never change (new
  // upload = new key), so the cache can live long.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    formats: ['image/webp'],
    deviceSizes: [384, 640, 828, 1080, 1280, 1920],
    imageSizes: [96, 160, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Account / back-office pages and the JSON API never belong in search
      // results (robots.txt also disallows the pages; this header covers
      // URLs a crawler learns about anyway).
      ...[...PRIVATE_PATH_PREFIXES, '/api'].map((prefix) => ({
        source: `${prefix}/:path*`,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
});
