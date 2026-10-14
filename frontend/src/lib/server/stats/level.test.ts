import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { canExport, getStatsLevel, lockedBlocks, periodAllowed } from './level';

const now = new Date('2026-11-10T12:00:00Z');
const DAY = 86_400_000;
const sub = (over: Record<string, unknown>) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'PRO_AGENT',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(now.getTime() + DAY),
    ...over,
  } as never);

describe('getStatsLevel', () => {
  it('is BASIC without a subscription row', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
  });

  it('follows the paid plan: Pro → FULL, Agence → ADVANCED', async () => {
    sub({});
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('FULL');
    sub({ planKey: 'AGENCY_PREMIUM' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('ADVANCED');
  });

  it('gives FULL during a trial', async () => {
    sub({ status: 'TRIAL' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('FULL');
  });

  it('drops to BASIC when the plan lapsed, even if the cron has not run yet', async () => {
    sub({ status: 'ACTIVE', currentPeriodEnd: new Date(now.getTime() - 8 * DAY) });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
    sub({ status: 'TRIAL', currentPeriodEnd: new Date(now.getTime() - 1) });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
    sub({ status: 'EXPIRED' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
  });
});

describe('capabilities', () => {
  it('BASIC only sees 7 and 30 days', () => {
    expect(periodAllowed('BASIC', '7j')).toBe(true);
    expect(periodAllowed('BASIC', '30j')).toBe(true);
    expect(periodAllowed('BASIC', '3m')).toBe(false);
    expect(periodAllowed('BASIC', '1a')).toBe(false);
  });

  it('FULL and ADVANCED see every period', () => {
    for (const level of ['FULL', 'ADVANCED'] as const) {
      for (const p of ['7j', '30j', '3m', '1a']) expect(periodAllowed(level, p)).toBe(true);
    }
  });

  it('only ADVANCED exports', () => {
    expect(canExport('BASIC')).toBe(false);
    expect(canExport('FULL')).toBe(false);
    expect(canExport('ADVANCED')).toBe(true);
  });

  it('locks three blocks for BASIC and nothing above', () => {
    expect(lockedBlocks('BASIC')).toEqual(['viewsTimeseries', 'topListings', 'trafficSources']);
    expect(lockedBlocks('FULL')).toEqual([]);
    expect(lockedBlocks('ADVANCED')).toEqual([]);
  });
});
