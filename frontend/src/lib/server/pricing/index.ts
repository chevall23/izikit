// Live pricing reader/writer. One PricingConfig row (id "default"); an absent,
// corrupt or unreachable row falls back to DEFAULT_PRICING so a bad edit or a
// DB blip can never take checkout down. Cached 60 s per instance.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { DEFAULT_PRICING, PricingDataSchema, type PricingData } from '@/lib/pricing';
import { createLogger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/prisma';

const log = createLogger();
const ROW_ID = 'default';
const CACHE_TTL_MS = 60_000;

let cache: { value: PricingData; expiresAt: number } | null = null;

export function invalidatePricingCache(): void {
  cache = null;
}

export async function getPricing(nowMs: number = Date.now()): Promise<PricingData> {
  if (cache && cache.expiresAt > nowMs) return cache.value;

  let value: PricingData = DEFAULT_PRICING;
  try {
    const row = await prisma.pricingConfig.findUnique({ where: { id: ROW_ID } });
    if (row) {
      const parsed = PricingDataSchema.safeParse(row.data);
      if (parsed.success) {
        value = parsed.data;
      } else {
        log.warn('PricingConfig row is invalid — using defaults', {
          issues: parsed.error.issues.length,
        });
      }
    }
  } catch (err) {
    log.warn('PricingConfig read failed — using defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
    return DEFAULT_PRICING; // do not cache a failure
  }

  cache = { value, expiresAt: nowMs + CACHE_TTL_MS };
  return value;
}

export async function savePricing(data: PricingData, updatedById: string): Promise<void> {
  const json = data as unknown as Prisma.InputJsonValue;
  await prisma.pricingConfig.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, data: json, updatedById },
    update: { data: json, updatedById },
  });
  invalidatePricingCache();
}
