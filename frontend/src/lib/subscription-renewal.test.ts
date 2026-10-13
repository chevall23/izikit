import { describe, it, expect } from 'vitest';
import { GRACE_PERIOD_MS, getRenewalState } from './subscription-renewal';

const DAY = 86_400_000;
const NOW = new Date('2026-11-10T12:00:00Z');
const iso = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const sub = (
  planKey: 'FREE' | 'PRO_AGENT' | 'AGENCY_PREMIUM',
  status: 'ACTIVE' | 'CANCELED' | 'GRACE',
  days: number | null,
) => ({ planKey, status, currentPeriodEnd: days === null ? null : iso(days) });

describe('getRenewalState', () => {
  it('never offers renewal on FREE or without a subscription', () => {
    expect(getRenewalState(null, NOW).canRenew).toBe(false);
    expect(getRenewalState(sub('FREE', 'ACTIVE', -2), NOW).canRenew).toBe(false);
  });

  it('does not offer renewal while the period end is more than 7 days away', () => {
    expect(getRenewalState(sub('PRO_AGENT', 'ACTIVE', 20), NOW).canRenew).toBe(false);
    expect(getRenewalState(sub('PRO_AGENT', 'ACTIVE', 7.5), NOW).canRenew).toBe(false);
  });

  it('offers renewal within 7 days of the period end, and once past it', () => {
    expect(getRenewalState(sub('PRO_AGENT', 'ACTIVE', 7), NOW).canRenew).toBe(true);
    expect(getRenewalState(sub('PRO_AGENT', 'ACTIVE', 2), NOW).canRenew).toBe(true);
    expect(getRenewalState(sub('AGENCY_PREMIUM', 'ACTIVE', -1), NOW).canRenew).toBe(true);
  });

  it('offers renewal for GRACE and CANCELED whatever the date', () => {
    expect(getRenewalState(sub('PRO_AGENT', 'CANCELED', 25), NOW).canRenew).toBe(true);
    expect(getRenewalState(sub('PRO_AGENT', 'GRACE', null), NOW).canRenew).toBe(true);
  });

  it('exposes the grace deadline (period end + 7 days) only for GRACE', () => {
    const grace = getRenewalState(sub('PRO_AGENT', 'GRACE', -2), NOW);
    expect(grace.inGrace).toBe(true);
    expect(grace.graceDeadline?.getTime()).toBe(NOW.getTime() - 2 * DAY + GRACE_PERIOD_MS);
    expect(getRenewalState(sub('PRO_AGENT', 'ACTIVE', 2), NOW).graceDeadline).toBeNull();
  });
});
