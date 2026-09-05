import { type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Right-anchored detail drawer (backdrop + sliding panel). The Banani source
 * shows this permanently open, eating 508px of every viewport — not viable on
 * mobile/tablet, so this is built as a real open/close overlay instead:
 * closed by default, opened by the caller's own state (e.g. clicking a table
 * row), full-width sheet below `sm:`. Shared shell for any future
 * "click a row → see detail" screen (Utilisateurs, Gestion des annonces…).
 */
export function AdminDrawer({
  open,
  onClose,
  title,
  titleExtra,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Simple text title — ignored when `header` is passed. */
  title?: string;
  titleExtra?: ReactNode;
  /** Full custom header content (e.g. an avatar + name + badges block) — replaces `title`/`titleExtra`. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-black/[0.08] px-[18px] py-4">
          {header ?? (
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="truncate font-sora text-[16px] font-bold text-neutral-900">{title}</h2>
              {titleExtra}
            </div>
          )}
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100"
          >
            <X className="h-4 w-4 text-neutral-900" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[18px]">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 flex-col gap-2.5 border-t border-black/[0.08] px-[18px] py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
