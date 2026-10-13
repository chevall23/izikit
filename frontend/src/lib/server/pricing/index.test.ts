import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_PRICING, type PricingData } from '@/lib/pricing';
import { getPricing, invalidatePricingCache, savePricing } from './index';

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
