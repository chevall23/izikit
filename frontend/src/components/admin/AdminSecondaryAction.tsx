import { type ReactNode } from 'react';

/**
 * The Banani admin `.action-card`: gray-50 pill with a white icon tile, a bold
 * title and a muted sub-line. Inert `type="button"` for now — no navigation
 * wired this pass. Shared by the admin login + inscription screens.
 */
export function AdminSecondaryAction({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-3 rounded-lg bg-gray-50 p-3.5 text-left"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-neutral-900">{title}</span>
        <span className="block truncate text-[12px] text-gray-400">{sub}</span>
      </span>
    </button>
  );
}
