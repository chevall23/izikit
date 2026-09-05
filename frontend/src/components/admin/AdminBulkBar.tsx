import { type ReactNode } from 'react';

/**
 * Tinted bar shown above a table's header row once ≥1 row is checkbox-selected
 * — "N sélectionné(s)" + action buttons. Appears/disappears with real
 * selection state; the actions themselves stay inert (no backend). Shared by
 * any future admin list screen with bulk row actions (Gestion des annonces…).
 */
export function AdminBulkBar({
  count,
  itemLabel = 'utilisateur',
  actions,
}: {
  count: number;
  /** Singular noun, e.g. "utilisateur", "annonce" — pluralized with a trailing "s". */
  itemLabel?: string;
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-brand/5 px-[18px] py-2.5">
      <span className="text-[13px] font-semibold text-brand">
        {count} {itemLabel}
        {count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
