// Shared by GET /api/listings/stats and its CSV export.
export const PERIOD_DAYS: Record<string, number> = { '7j': 7, '30j': 30, '3m': 90, '1a': 365 };

export function trend(current: number, previous: number): { trendPct: number; up: boolean } {
  if (previous === 0) return { trendPct: current > 0 ? 100 : 0, up: current >= 0 };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { trendPct: pct, up: pct >= 0 };
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
