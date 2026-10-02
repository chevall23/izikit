// Account / back-office sections that must never appear in search results.
// Consumed by app/robots.ts (Disallow) and next.config.ts (X-Robots-Tag
// noindex header) — kept import-free so next.config.ts can load it.
export const PRIVATE_PATH_PREFIXES = [
  '/admin',
  '/alertes',
  '/auth',
  '/contacts',
  '/dashboard',
  '/demandes',
  '/forgot-password',
  '/jetons',
  '/listings',
  '/login',
  '/messages',
  '/orders',
  '/reset-password',
  '/settings',
  '/signup',
  '/statistiques',
  '/verify-email',
  '/visites',
] as const;
