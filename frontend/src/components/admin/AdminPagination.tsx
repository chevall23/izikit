import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Table-footer pagination bar: "Affichage X–Y sur Z", a rows-per-page pill,
 * and page buttons. Presentational by default (no paging logic — the mockup
 * shows one page of static rows), but wired list screens can pass
 * `onPrev` / `onNext` / `onPage` to make the controls live. Shared by every
 * `/admin/*` list screen that needs the same footer shape.
 */
export function AdminPagination({
  from,
  to,
  total,
  itemLabel,
  perPage = 10,
  pages = [1],
  activePage = 1,
  onPrev,
  onNext,
  onPage,
  disabledPrev,
  disabledNext,
}: {
  from: number;
  to: number;
  total: number;
  itemLabel: string;
  perPage?: number;
  /** Page numbers to render — pass `'…'` as a literal, non-clickable gap marker. */
  pages?: (number | '…')[];
  activePage?: number;
  /** When provided, wires the Prev/Next/number buttons. Omitted → inert (mockup). */
  onPrev?: () => void;
  onNext?: () => void;
  onPage?: (page: number) => void;
  disabledPrev?: boolean;
  disabledNext?: boolean;
}) {
  const live = Boolean(onPrev || onNext || onPage);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5">
      <p className="text-[13px] whitespace-nowrap text-gray-400">
        Affichage {from}–{to} sur {total} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 text-[13px] whitespace-nowrap text-neutral-900"
        >
          {perPage} par page
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Page précédente"
            onClick={onPrev}
            disabled={live ? disabledPrev : undefined}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400',
              live && !disabledPrev && 'hover:bg-gray-100 hover:text-neutral-900',
              live && disabledPrev && 'cursor-not-allowed opacity-40',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span
                key={`gap-${i}`}
                className="flex h-8 w-8 items-center justify-center text-[13px] text-gray-400"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === activePage ? 'page' : undefined}
                onClick={onPage ? () => onPage(p) : undefined}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold',
                  p === activePage ? 'bg-brand text-brand-foreground' : 'bg-gray-50 text-gray-400',
                  live && p !== activePage && 'hover:bg-gray-100 hover:text-neutral-900',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Page suivante"
            onClick={onNext}
            disabled={live ? disabledNext : undefined}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400',
              live && !disabledNext && 'hover:bg-gray-100 hover:text-neutral-900',
              live && disabledNext && 'cursor-not-allowed opacity-40',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
