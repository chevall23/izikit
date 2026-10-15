// Client-safe renewal decision for the settings subscription card. Keep the
// grace length in sync with the server lifecycle (lib/server/subscriptions).
export const GRACE_PERIOD_MS = 7 * 24 * 3600 * 1000;
const RENEWAL_WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface RenewableSubscription {
  planKey: 'FREE' | 'PRO_AGENT' | 'AGENCY_PREMIUM';
  status: 'ACTIVE' | 'CANCELED' | 'GRACE' | 'TRIAL' | 'EXPIRED';
  currentPeriodEnd: string | null;
}

export interface RenewalState {
  canRenew: boolean;
  inGrace: boolean;
  /** period end + grace length, only when in GRACE with a known period end. */
  graceDeadline: Date | null;
}

export function getRenewalState(sub: RenewableSubscription | null, now: Date): RenewalState {
  const none: RenewalState = { canRenew: false, inGrace: false, graceDeadline: null };
  if (!sub || sub.planKey === 'FREE') return none;

  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const inGrace = sub.status === 'GRACE';
  const nearEnd = end !== null && end.getTime() - now.getTime() <= RENEWAL_WINDOW_MS;
  return {
    canRenew: inGrace || sub.status === 'CANCELED' || sub.status === 'TRIAL' || nearEnd,
    inGrace,
    graceDeadline: inGrace && end ? new Date(end.getTime() + GRACE_PERIOD_MS) : null,
  };
}
