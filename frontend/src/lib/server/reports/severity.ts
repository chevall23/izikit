// Derives a UI-facing "gravité" from `ListingReport.reason` — there is no
// stored severity column (real-data-only scope: the public report form
// stays anonymous and unchanged, see /api/public/listings/[id]/reports).
// SCAM/FAKE reports are the ones that can cost a victim real money —
// treated as critical; INCORRECT_INFO is a moderate content issue; SOLD/
// OTHER are informational and low-priority.
import 'server-only';

export type ReportSeverity = 'CRITICAL' | 'MEDIUM' | 'LOW';

const SEVERITY_BY_REASON: Record<string, ReportSeverity> = {
  SCAM: 'CRITICAL',
  FAKE: 'CRITICAL',
  INCORRECT_INFO: 'MEDIUM',
  SOLD: 'LOW',
  OTHER: 'LOW',
};

export function reportSeverity(reason: string): ReportSeverity {
  return SEVERITY_BY_REASON[reason] ?? 'LOW';
}

/** Reasons matching a severity tier — used by the `severity` list/export filter. */
export function reasonsForSeverity(severity: string): string[] {
  return Object.entries(SEVERITY_BY_REASON)
    .filter(([, s]) => s === severity)
    .map(([reason]) => reason);
}
