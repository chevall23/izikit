import { describe, it, expect } from 'vitest';
import { TRIAL_DAYS, isTrialEligible } from './trial';

const sub = (
  over: Partial<{ planKey: string; status: string; trialStartedAt: Date | null }> = {},
) => ({
  planKey: 'FREE',
  status: 'ACTIVE',
  trialStartedAt: null,
  ...over,
});

describe('isTrialEligible', () => {
  it('lasts 14 days', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('is open to an agent who was never subscribed', () => {
    expect(isTrialEligible('OWNER_AGENT', null)).toBe(true);
    expect(isTrialEligible('OWNER_AGENT', sub())).toBe(true);
  });

  it('is closed to non-agents', () => {
    expect(isTrialEligible('TENANT_BUYER', null)).toBe(false);
    expect(isTrialEligible(undefined, null)).toBe(false);
  });

  it('is closed once a trial was taken, even after going back to FREE', () => {
    expect(isTrialEligible('OWNER_AGENT', sub({ trialStartedAt: new Date() }))).toBe(false);
  });

  it('is closed to anyone who had or has a paid subscription', () => {
    for (const status of ['ACTIVE', 'GRACE', 'CANCELED', 'EXPIRED', 'TRIAL']) {
      expect(isTrialEligible('OWNER_AGENT', sub({ planKey: 'PRO_AGENT', status }))).toBe(false);
    }
    // a lapsed paid subscription is back on FREE but EXPIRED
    expect(isTrialEligible('OWNER_AGENT', sub({ status: 'EXPIRED' }))).toBe(false);
  });
});
