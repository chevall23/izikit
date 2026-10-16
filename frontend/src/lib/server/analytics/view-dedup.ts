// One listing view per visitor per window.
//
// GET /api/public/listings/[id] used to count every call, so reloading a page
// 12 times gave 12 views. A visitor is identified by a keyed hash of their IP
// and user agent (no cookie, nothing stored in the database, the raw IP never
// leaves this function). The first view in the window wins a Redis SET NX; when
// Redis is not configured, or fails, a per-process map plays the same role.
//
// Trade-offs, on purpose: two people behind the same IP and browser count once,
// and a visitor whose IP cannot be read is always counted (merging every unknown
// visitor into one would be worse than counting a few reloads).
import 'server-only';
import { createHmac } from 'node:crypto';
import { redis } from '../redis';
import { log } from '../observability/log';

export const VIEW_DEDUP_WINDOW_SECONDS = 24 * 60 * 60;

const MAX_LOCAL_ENTRIES = 50_000;
const local = new Map<string, number>();

function visitorKey(listingId: string, ip: string, userAgent: string): string {
  const secret = process.env.JWT_SECRET ?? 'listing-view-dedup';
  const hash = createHmac('sha256', secret).update(`${ip}|${userAgent}`).digest('hex').slice(0, 32);
  return `listing-view:${listingId}:${hash}`;
}

function localFirstView(key: string, now: number): boolean {
  const expiresAt = local.get(key);
  if (expiresAt !== undefined && expiresAt > now) return false;
  if (local.size >= MAX_LOCAL_ENTRIES) {
    for (const [k, exp] of local) if (exp <= now) local.delete(k);
    if (local.size >= MAX_LOCAL_ENTRIES) local.clear();
  }
  local.set(key, now + VIEW_DEDUP_WINDOW_SECONDS * 1000);
  return true;
}

/** true when this visitor has not viewed this listing in the last 24 h. */
export async function isFirstViewInWindow(input: {
  listingId: string;
  ip: string;
  userAgent: string;
  now?: number;
}): Promise<boolean> {
  if (input.ip === 'unknown') return true;
  const key = visitorKey(input.listingId, input.ip, input.userAgent);
  const now = input.now ?? Date.now();

  if (redis) {
    try {
      const set = await redis.set(key, '1', { nx: true, ex: VIEW_DEDUP_WINDOW_SECONDS });
      return set === 'OK';
    } catch (err) {
      log.warn('view-dedup: redis failed, using the local map', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return localFirstView(key, now);
}

/** Test helper. */
export function __resetViewDedup(): void {
  local.clear();
}
