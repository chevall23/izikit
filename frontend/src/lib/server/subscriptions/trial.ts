// 14-day Pro trial: who may start it. A trial is a one-off per account — the
// `trialStartedAt` marker outlives the trial itself — and never goes to
// someone who already had a paid plan (their FREE row is EXPIRED, not ACTIVE).
import 'server-only';

export const TRIAL_DAYS = 14;
export const TRIAL_DAYS_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export function isTrialEligible(
  accountType: string | null | undefined,
  sub: { planKey: string; status: string; trialStartedAt: Date | null } | null,
): boolean {
  if (accountType !== 'OWNER_AGENT') return false;
  if (sub === null) return true;
  return sub.planKey === 'FREE' && sub.status === 'ACTIVE' && sub.trialStartedAt === null;
}
