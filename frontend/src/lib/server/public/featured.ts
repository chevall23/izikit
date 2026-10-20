// Rotation of the home page "Annonces à la une". Showing the N latest listings
// means every visitor sees the same grid until someone publishes. Instead we
// draw N out of a larger pool of recent listings; the draw changes every
// FEATURED_ROTATION_MS but is deterministic inside the window, so the page is
// stable (and cacheable, no SSR/CSR mismatch) and two visitors see the same
// thing at the same time. Listings published in the last FRESH_DAYS are
// FRESH_WEIGHT times more likely to be drawn so the page keeps looking alive.
import { hash } from '@/lib/server/public/boosted';

export const FEATURED_POOL_SIZE = 36;
export const FEATURED_ROTATION_MS = 3_600_000;
const FRESH_DAYS = 7;
const FRESH_WEIGHT = 3;
const DAY_MS = 86_400_000;

export function selectFeatured<T extends { id: string; createdAt: Date | string }>(
  pool: T[],
  now: Date,
  count: number,
): T[] {
  if (count <= 0 || pool.length === 0) return [];
  const bucket = Math.floor(now.getTime() / FEATURED_ROTATION_MS);
  // Weighted sampling without replacement (Efraimidis–Spirakis): sort by u^(1/w).
  // Logs keep it numerically safe: log(u) / w, bigger is better.
  return pool
    .map((item) => {
      const fresh = now.getTime() - new Date(item.createdAt).getTime() < FRESH_DAYS * DAY_MS;
      const u = (hash(`${item.id}:${bucket}`) + 1) / 4_294_967_297;
      return { item, key: Math.log(u) / (fresh ? FRESH_WEIGHT : 1) };
    })
    .sort((a, b) => b.key - a.key || (a.item.id < b.item.id ? -1 : 1))
    .slice(0, count)
    .map((x) => x.item);
}
