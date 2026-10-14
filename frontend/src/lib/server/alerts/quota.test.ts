import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { checkAlertQuota, disableExcessAlerts, SEEKER_ALERT_CAP } from './quota';

const now = new Date('2026-11-01T12:00:00Z');
const agent = () =>
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
const seeker = () =>
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
const noSub = () => prismaMock.subscription.findUnique.mockResolvedValue(null);
const sub = (planKey: string) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey,
    status: 'ACTIVE',
    currentPeriodEnd: new Date('2026-12-01'),
  } as never);

describe('checkAlertQuota', () => {
  it('refuses every alert for a FREE agent (grid: 0 included)', async () => {
    agent();
    noSub();
    prismaMock.alert.count.mockResolvedValue(0);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      planKey: 'FREE',
      limit: 0,
      used: 0,
    });
  });

  it('allows a PRO agent up to 10 active alerts', async () => {
    agent();
    sub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(9);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true,
      limit: 10,
      used: 9,
    });
    prismaMock.alert.count.mockResolvedValue(10);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      used: 10,
    });
  });

  it('is unlimited for Agence, without counting', async () => {
    agent();
    sub('AGENCY_PREMIUM');
    const r = await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now });
    expect(r).toMatchObject({ allowed: true, limit: null });
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('caps a seeker at 20 whatever the plan, so a FREE seeker can still create alerts', async () => {
    seeker();
    noSub();
    prismaMock.alert.count.mockResolvedValue(19);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true,
      limit: SEEKER_ALERT_CAP,
    });
    prismaMock.alert.count.mockResolvedValue(20);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
    });
  });

  it('uses the effective plan: a lapsed PRO agent is limited like FREE', async () => {
    agent();
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-10-01'),
    } as never);
    prismaMock.alert.count.mockResolvedValue(0);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      planKey: 'FREE',
    });
  });

  it('excludes the alert being reactivated from the count', async () => {
    agent();
    sub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(0);
    await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now, excludeAlertId: 'a9' });
    expect(prismaMock.alert.count).toHaveBeenCalledWith({
      where: { userId: 'u1', active: true, id: { not: 'a9' } },
    });
  });
});

describe('disableExcessAlerts', () => {
  const alerts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i + 1}` })) as never;

  it('keeps the oldest alerts and deactivates the rest (never deletes)', async () => {
    agent();
    prismaMock.alert.findMany.mockResolvedValue(alerts(12));
    prismaMock.alert.updateMany.mockResolvedValue({ count: 2 });
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'PRO_AGENT')).toBe(2);
    expect(prismaMock.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a11', 'a12'] }, active: true },
      data: { active: false },
    });
    expect(prismaMock.alert.deleteMany).not.toHaveBeenCalled();
  });

  it('deactivates everything for a FREE agent (limit 0)', async () => {
    agent();
    prismaMock.alert.findMany.mockResolvedValue(alerts(3));
    prismaMock.alert.updateMany.mockResolvedValue({ count: 3 });
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'FREE')).toBe(3);
  });

  it('leaves a seeker alone', async () => {
    seeker();
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(prismaMock.alert.findMany).not.toHaveBeenCalled();
  });

  it('does nothing on an unlimited plan or when under the limit', async () => {
    agent();
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(0);
    prismaMock.alert.findMany.mockResolvedValue(alerts(4));
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'PRO_AGENT')).toBe(0);
    expect(prismaMock.alert.updateMany).not.toHaveBeenCalled();
  });
});
