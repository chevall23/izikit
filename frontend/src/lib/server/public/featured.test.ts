import { describe, expect, it } from 'vitest';
import { FEATURED_ROTATION_MS, selectFeatured } from './featured';

const NOW = new Date('2026-10-20T10:15:00Z');
const OLD = '2026-01-01T00:00:00Z';

const pool = Array.from({ length: 36 }, (_, i) => ({ id: `l${i}`, createdAt: OLD }));
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('selectFeatured', () => {
  it('returns `count` distinct items from the pool', () => {
    const out = ids(selectFeatured(pool, NOW, 12));
    expect(out).toHaveLength(12);
    expect(new Set(out).size).toBe(12);
  });

  it('is stable inside a rotation window', () => {
    const later = new Date(NOW.getTime() + 60_000);
    expect(ids(selectFeatured(pool, later, 12))).toEqual(ids(selectFeatured(pool, NOW, 12)));
  });

  it('changes across rotation windows', () => {
    const seen = new Set<string>();
    for (let w = 0; w < 6; w++) {
      const t = new Date(NOW.getTime() + w * FEATURED_ROTATION_MS);
      seen.add(ids(selectFeatured(pool, t, 12)).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns the whole pool when it is smaller than `count`', () => {
    const small = pool.slice(0, 5);
    expect(ids(selectFeatured(small, NOW, 12)).sort()).toEqual(ids(small).sort());
  });

  it('handles empty pool and non-positive count', () => {
    expect(selectFeatured([], NOW, 12)).toEqual([]);
    expect(selectFeatured(pool, NOW, 0)).toEqual([]);
  });

  it('favours listings published in the last 7 days', () => {
    const fresh = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`,
      createdAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
    }));
    const mixed = [...fresh, ...pool.slice(0, 24)];
    let freshShown = 0;
    const windows = 200;
    for (let w = 0; w < windows; w++) {
      const t = new Date(NOW.getTime() + w * FEATURED_ROTATION_MS);
      freshShown += selectFeatured(mixed, t, 12).filter((x) => x.id.startsWith('f')).length;
    }
    // Unweighted expectation would be 4 of 12 per draw.
    expect(freshShown / windows).toBeGreaterThan(5);
  });
});
