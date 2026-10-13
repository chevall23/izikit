import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { checkListingQuota, hideExcessListings, reactivateHiddenListings } from './quota';

const now = new Date('2026-11-01T12:00:00Z');
const noSub = () => prismaMock.subscription.findUnique.mockResolvedValue(null);

describe('checkListingQuota', () => {
  it('allows below the FREE limit and refuses at it', async () => {
    noSub();
    prismaMock.listing.count.mockResolvedValue(2);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true,
      planKey: 'FREE',
      limit: 3,
      used: 2,
    });
    prismaMock.listing.count.mockResolvedValue(3);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      limit: 3,
      used: 3,
    });
  });

  it('is unlimited on a plan with a null quota, without counting', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'AGENCY_PREMIUM',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-12-01'),
    } as never);
    const r = await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now });
    expect(r).toMatchObject({ allowed: true, planKey: 'AGENCY_PREMIUM', limit: null });
    expect(prismaMock.listing.count).not.toHaveBeenCalled();
  });

  it('uses the effective plan: a lapsed PRO is limited like FREE', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-10-01'),
    } as never);
    prismaMock.listing.count.mockResolvedValue(3);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      planKey: 'FREE',
    });
  });

  it('excludes the listing being edited from the count', async () => {
    noSub();
    prismaMock.listing.count.mockResolvedValue(0);
    await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now, excludeListingId: 'l9' });
    expect(prismaMock.listing.count).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { in: ['VERIFIED', 'PENDING'] }, id: { not: 'l9' } },
    });
  });
});

describe('hideExcessListings', () => {
  it('keeps the newest N published and hides only older VERIFIED ones', async () => {
    prismaMock.listing.findMany.mockResolvedValue([
      { id: 'a', status: 'VERIFIED' },
      { id: 'b', status: 'VERIFIED' },
      { id: 'c', status: 'VERIFIED' },
      { id: 'd', status: 'PENDING' },
      { id: 'e', status: 'VERIFIED' },
    ] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 1 });
    expect(await hideExcessListings(prismaMock, 'u1', 3)).toBe(1);
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e'] }, status: 'VERIFIED' },
      data: { status: 'HIDDEN' },
    });
  });

  it('leaves a PENDING row beyond the limit untouched', async () => {
    prismaMock.listing.findMany.mockResolvedValue([
      { id: 'a', status: 'VERIFIED' },
      { id: 'b', status: 'PENDING' },
      { id: 'c', status: 'VERIFIED' },
    ] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 1 });
    await hideExcessListings(prismaMock, 'u1', 1);
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c'] }, status: 'VERIFIED' },
      data: { status: 'HIDDEN' },
    });
  });

  it('does nothing for an unlimited plan or when under the limit', async () => {
    expect(await hideExcessListings(prismaMock, 'u1', null)).toBe(0);
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'a', status: 'VERIFIED' }] as never);
    expect(await hideExcessListings(prismaMock, 'u1', 3)).toBe(0);
    expect(prismaMock.listing.updateMany).not.toHaveBeenCalled();
  });
});

describe('reactivateHiddenListings', () => {
  it('restores the newest hidden listings up to the free slots', async () => {
    prismaMock.listing.count.mockResolvedValue(28);
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 2 });
    expect(await reactivateHiddenListings(prismaMock, 'u1', 30)).toBe(2);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', status: 'HIDDEN' }, take: 2 }),
    );
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['x', 'y'] }, status: 'HIDDEN' },
      data: { status: 'VERIFIED' },
    });
  });

  it('restores everything (take capped at 1000) on an unlimited plan', async () => {
    prismaMock.listing.count.mockResolvedValue(500);
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'x' }] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 1 });
    expect(await reactivateHiddenListings(prismaMock, 'u1', null)).toBe(1);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });

  it('restores nothing when the quota is already full', async () => {
    prismaMock.listing.count.mockResolvedValue(30);
    expect(await reactivateHiddenListings(prismaMock, 'u1', 30)).toBe(0);
    expect(prismaMock.listing.findMany).not.toHaveBeenCalled();
  });
});
