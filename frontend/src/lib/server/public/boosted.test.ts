import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { MAX_PINNED, pageWindow, pickPinnedIds, selectPinned } from './boosted';

const at = (iso: string) => new Date(iso);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`);

describe('selectPinned', () => {
  it('returns every candidate when there are at most `max`', () => {
    expect([...selectPinned(ids(2), at('2026-11-01T10:00:00Z'), 3)].sort()).toEqual(['l1', 'l2']);
    expect(selectPinned([], at('2026-11-01T10:00:00Z'), 3)).toEqual([]);
  });

  it('never returns more than `max` (and never more than the candidates)', () => {
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), MAX_PINNED)).toHaveLength(3);
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), 2)).toHaveLength(2);
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), 0)).toEqual([]);
  });

  it('is stable inside the same hour, whatever the candidate order', () => {
    const a = selectPinned(ids(10), at('2026-11-01T10:05:00Z'), 3);
    const b = selectPinned([...ids(10)].reverse(), at('2026-11-01T10:55:00Z'), 3);
    expect(b).toEqual(a);
  });

  it('rotates when the hour changes', () => {
    const picks = new Set<string>();
    for (let h = 0; h < 12; h++) {
      picks.add(
        selectPinned(ids(10), at(`2026-11-01T${String(h).padStart(2, '0')}:10:00Z`), 3).join(),
      );
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('pageWindow', () => {
  it('page 1 leaves room for the pinned listings', () => {
    expect(pageWindow(1, 18, 3)).toEqual({ skip: 0, take: 15 });
    expect(pageWindow(1, 18, 0)).toEqual({ skip: 0, take: 18 });
  });

  it('later pages are shifted by the pinned count so nothing is lost or duplicated', () => {
    // page 1 gave 3 of its 18 slots to listings that are outside the rest list
    expect(pageWindow(2, 18, 3)).toEqual({ skip: 15, take: 18 });
    expect(pageWindow(3, 18, 3)).toEqual({ skip: 33, take: 18 });
    expect(pageWindow(2, 18, 0)).toEqual({ skip: 18, take: 18 });
  });

  it('never yields a negative take or skip, even with a tiny limit', () => {
    expect(pageWindow(1, 2, 2)).toEqual({ skip: 0, take: 0 });
    expect(pageWindow(2, 2, 2)).toEqual({ skip: 0, take: 2 });
  });
});

describe('pickPinnedIds', () => {
  it('only looks at listings boosted in the future and keeps the caller filters', async () => {
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
    const now = at('2026-11-01T10:00:00Z');
    const out = await pickPinnedIds({ status: 'VERIFIED', city: 'Cotonou' }, now, 18);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'VERIFIED', city: 'Cotonou', boostedUntil: { gt: now } },
        select: { id: true },
      }),
    );
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('caps at the page limit when it is smaller than 3', async () => {
    prismaMock.listing.findMany.mockResolvedValue(ids(5).map((id) => ({ id })) as never);
    expect(await pickPinnedIds({ status: 'VERIFIED' }, at('2026-11-01T10:00:00Z'), 2)).toHaveLength(
      2,
    );
  });
});
