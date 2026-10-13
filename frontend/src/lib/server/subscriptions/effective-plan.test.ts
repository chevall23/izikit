import { describe, it, expect } from 'vitest';
import { GRACE_PERIOD_MS, getEffectivePlanKey } from './effective-plan';

const now = new Date('2026-11-01T12:00:00Z');
const end = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const DAY = 86_400_000;

describe('getEffectivePlanKey', () => {
  it('is FREE without a subscription row or on the FREE plan', () => {
    expect(getEffectivePlanKey(null, now)).toBe('FREE');
    expect(
      getEffectivePlanKey({ planKey: 'FREE', status: 'ACTIVE', currentPeriodEnd: null }, now),
    ).toBe('FREE');
  });

  it('keeps a paid plan during the paid period and during the grace window', () => {
    const base = { planKey: 'PRO_AGENT' };
    expect(
      getEffectivePlanKey({ ...base, status: 'ACTIVE', currentPeriodEnd: end(DAY) }, now),
    ).toBe('PRO_AGENT');
    expect(
      getEffectivePlanKey({ ...base, status: 'GRACE', currentPeriodEnd: end(-3 * DAY) }, now),
    ).toBe('PRO_AGENT');
    expect(
      getEffectivePlanKey(
        { ...base, status: 'ACTIVE', currentPeriodEnd: end(-GRACE_PERIOD_MS + 1) },
        now,
      ),
    ).toBe('PRO_AGENT');
  });

  it('drops to FREE once the grace window is over, even if the cron has not run', () => {
    expect(
      getEffectivePlanKey(
        { planKey: 'PRO_AGENT', status: 'GRACE', currentPeriodEnd: end(-GRACE_PERIOD_MS - 1) },
        now,
      ),
    ).toBe('FREE');
  });

  it('treats EXPIRED as FREE', () => {
    expect(
      getEffectivePlanKey(
        { planKey: 'PRO_AGENT', status: 'EXPIRED', currentPeriodEnd: end(DAY) },
        now,
      ),
    ).toBe('FREE');
  });

  it('keeps a CANCELED plan until the period end, with no grace', () => {
    expect(
      getEffectivePlanKey(
        { planKey: 'PRO_AGENT', status: 'CANCELED', currentPeriodEnd: end(DAY) },
        now,
      ),
    ).toBe('PRO_AGENT');
    expect(
      getEffectivePlanKey(
        { planKey: 'PRO_AGENT', status: 'CANCELED', currentPeriodEnd: end(-1) },
        now,
      ),
    ).toBe('FREE');
  });

  it('keeps a paid plan with no period end (manual grant)', () => {
    expect(
      getEffectivePlanKey(
        { planKey: 'AGENCY_PREMIUM', status: 'ACTIVE', currentPeriodEnd: null },
        now,
      ),
    ).toBe('AGENCY_PREMIUM');
  });

  it('treats an unknown plan key as FREE', () => {
    expect(
      getEffectivePlanKey({ planKey: 'GOLD', status: 'ACTIVE', currentPeriodEnd: end(DAY) }, now),
    ).toBe('FREE');
  });
});
