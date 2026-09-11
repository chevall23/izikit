'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Numbered pagination on top of a cursor endpoint (`{ items, nextCursor }`).
 *
 * The API only knows how to hand out "the page after this cursor", so a jump
 * to page N walks the cursor forward from the furthest page already seen,
 * caching each page's cursor. Prev / already-visited pages are instant; a
 * forward jump costs a few sequential GETs. `total` (from the tab's count)
 * drives how many page buttons to show.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface Options<T> {
  perPage: number;
  /** Total rows for the active view — drives the page count. */
  total: number;
  fetchPage: (cursor: string | null) => Promise<CursorPage<T>>;
  /** Change this to snap back to page 1 (e.g. the active status tab). */
  resetKey: string;
}

interface Result<T> {
  items: T[];
  loading: boolean;
  error: boolean;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  pageNumbers: (number | '…')[];
  goPrev: () => void;
  goNext: () => void;
  goPage: (page: number) => void;
  reload: () => void;
}

function windowed(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pageCount - 1, page + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pageCount - 1) out.push('…');
  out.push(pageCount);
  return out;
}

export function useCursorPager<T>({ perPage, total, fetchPage, resetKey }: Options<T>): Result<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  // cursors[i] is the cursor that yields page i+1; cursors[0] is always null.
  const cursors = useRef<(string | null)[]>([null]);
  // Guards against out-of-order responses when the user clicks quickly.
  const runId = useRef(0);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const go = useCallback(
    async (target: number) => {
      const clamped = Math.min(Math.max(1, target), pageCount);
      const myRun = ++runId.current;
      setLoading(true);
      setError(false);
      try {
        // Walk the cursor forward until we know how to fetch `clamped`.
        while (cursors.current.length < clamped) {
          const fromCursor = cursors.current[cursors.current.length - 1] ?? null;
          const res = await fetchPage(fromCursor);
          if (myRun !== runId.current) return;
          if (res.nextCursor == null) break; // data is shorter than expected
          cursors.current.push(res.nextCursor);
        }
        const landing = Math.min(clamped, cursors.current.length);
        const res = await fetchPage(cursors.current[landing - 1] ?? null);
        if (myRun !== runId.current) return;
        setItems(res.items);
        setPage(landing);
      } catch {
        if (myRun !== runId.current) return;
        setError(true);
        setItems([]);
      } finally {
        if (myRun === runId.current) setLoading(false);
      }
    },
    [fetchPage, pageCount],
  );

  // Reset to page 1 whenever the view key changes.
  useEffect(() => {
    cursors.current = [null];
    void go(1);
  }, [resetKey]);

  // If a reload shrank the data below the current page, pull back into range.
  useEffect(() => {
    if (page > pageCount) void go(pageCount);
  }, [pageCount]);

  const reload = useCallback(() => {
    cursors.current = [null];
    void go(1);
  }, [go]);

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, from + items.length - 1, total);

  return {
    items,
    loading,
    error,
    page,
    pageCount,
    from,
    to: Math.max(from === 0 ? 0 : from - 1, to),
    pageNumbers: windowed(page, pageCount),
    goPrev: () => void go(page - 1),
    goNext: () => void go(page + 1),
    goPage: (p: number) => void go(p),
    reload,
  };
}
