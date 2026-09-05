import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Table-footer pagination bar: "Affichage X–Y sur Z", a rows-per-page pill,
 * and page buttons. Purely presentational/inert (no real paging logic — the
 * mockup only ever shows one page of static rows) but shared by every
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
}: {
  from: number;
  to: number;
  total: number;
  itemLabel: string;
  perPage?: number;
  /** Page numbers to render — pass `'…'` as a literal, non-clickable gap marker. */
  pages?: (number | '…')[];
  activePage?: number;
}) {
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
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400"
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
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold',
                  p === activePage ? 'bg-brand text-brand-foreground' : 'bg-gray-50 text-gray-400',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Page suivante"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
