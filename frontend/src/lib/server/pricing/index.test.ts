import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_PRICING, type PricingData } from '@/lib/pricing';
import {
  getPricing,
  invalidatePricingCache,
  readStoredPricing,
  savePricing,
  writePricing,
} from './index';

const custom = (): PricingData => {
  const p = structuredClone(DEFAULT_PRICING);
  p.plans.PRO_AGENT.priceFcfa = 19_900;
  return p;
};

beforeEach(() => {
  invalidatePricingCache();
});

describe('getPricing', () => {
  it('returns defaults when no row exists', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('returns the stored config when valid', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue({
      id: 'default',
      data: custom(),
      updatedById: null,
      updatedAt: new Date(),
    } as never);
    expect((await getPricing()).plans.PRO_AGENT.priceFcfa).toBe(19_900);
  });

  it('falls back to defaults on a corrupt row', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue({
      id: 'default',
      data: { plans: 'nope' },
      updatedById: null,
      updatedAt: new Date(),
    } as never);
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('falls back to defaults when the database throws', async () => {
    prismaMock.pricingConfig.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('caches for 60 s then re-reads', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    await getPricing(1_000);
    await getPricing(30_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(1);
    await getPricing(62_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('savePricing', () => {
  it('upserts the default row and invalidates the cache', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    await getPricing(1_000);
    prismaMock.pricingConfig.upsert.mockResolvedValue({} as never);
    await savePricing(custom(), 'admin-1');
    expect(prismaMock.pricingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'default' },
        create: expect.objectContaining({ id: 'default', updatedById: 'admin-1' }),
      }),
    );
    await getPricing(2_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('readStoredPricing / writePricing', () => {
  it('reads the stored row through the given client, defaults when absent or corrupt', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValueOnce({ data: custom() } as never);
    expect((await readStoredPricing(prismaMock)).plans.PRO_AGENT.priceFcfa).toBe(19_900);
    prismaMock.pricingConfig.findUnique.mockResolvedValueOnce(null);
    expect(await readStoredPricing(prismaMock)).toEqual(DEFAULT_PRICING);
    prismaMock.pricingConfig.findUnique.mockResolvedValueOnce({ data: { plans: 1 } } as never);
    expect(await readStoredPricing(prismaMock)).toEqual(DEFAULT_PRICING);
  });

  it('writePricing upserts via the given client without touching the cache', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    await getPricing(1_000);
    prismaMock.pricingConfig.upsert.mockResolvedValue({} as never);
    await writePricing(prismaMock, custom(), 'admin-1');
    expect(prismaMock.pricingConfig.upsert).toHaveBeenCalledTimes(1);
    await getPricing(2_000); // still cached
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(1);
  });
});
