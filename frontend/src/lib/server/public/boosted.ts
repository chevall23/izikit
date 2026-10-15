// Pinning of boosted listings on the public result pages. Boosted listings
// matching the active filters are pinned at the top of PAGE 1 only (a per-page
// cap would break pagination). At most MAX_PINNED are shown; when more are
// boosted they rotate every hour, deterministically, so the page is stable
// (and cacheable) inside the hour and no advertiser is always last.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';

export const MAX_PINNED = 3;
const CANDIDATE_LIMIT = 200;
const HOUR_MS = 3_600_000;

// FNV-1a 32-bit — tiny, deterministic, good enough to shuffle.
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function selectPinned(candidateIds: string[], now: Date, max: number): string[] {
  if (max <= 0 || candidateIds.length === 0) return [];
  const bucket = Math.floor(now.getTime() / HOUR_MS);
  return [...candidateIds]
    .map((id) => ({ id, h: hash(`${id}:${bucket}`) }))
    .sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1))
    .slice(0, max)
    .map((x) => x.id);
}

/**
 * Window over the non-pinned list. Page 1 shows `pinned` listings plus the
 * first `limit - pinned` others; page n shows the next `limit` others, shifted
 * by the `pinned` slots page 1 gave away.
 */
export function pageWindow(
  page: number,
  limit: number,
  pinnedCount: number,
): { skip: number; take: number } {
  if (page <= 1) return { skip: 0, take: Math.max(0, limit - pinnedCount) };
  return { skip: Math.max(0, (page - 1) * limit - pinnedCount), take: limit };
}

export async function pickPinnedIds(
  where: Prisma.ListingWhereInput,
  now: Date,
  limit: number,
): Promise<string[]> {
  const max = Math.min(MAX_PINNED, limit);
  if (max <= 0) return [];
  const rows = await prisma.listing.findMany({
    where: { ...where, boostedUntil: { gt: now } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: CANDIDATE_LIMIT,
  });
  return selectPinned(
    rows.map((r) => r.id),
    now,
    max,
  );
}
