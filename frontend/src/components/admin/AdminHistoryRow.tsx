import { cn } from '@/lib/utils';

/** One row of a "changelog" list: dot + field name + old→new value + author + time. */
export function AdminHistoryRow({
  field,
  from,
  to,
  authorName,
  authorAvatarUrl,
  time,
  latest = false,
}: {
  field: string;
  from: string;
  to: string;
  authorName: string;
  authorAvatarUrl: string;
  time: string;
  /** Highlights the dot in brand color for the most recent entry. */
  latest?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-black/[0.05] px-5 py-2.5 last:border-b-0">
      <span
        className={cn(
          'h-[7px] w-[7px] flex-shrink-0 rounded-full',
          latest ? 'bg-brand' : 'bg-gray-300',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-neutral-900">{field}</div>
        <div className="truncate text-[12px] text-gray-400">
          {from} <span className="mx-1 font-bold text-brand">→</span> {to}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <img src={authorAvatarUrl} alt="" className="h-[22px] w-[22px] rounded-full object-cover" />
        <span className="text-[12px] whitespace-nowrap text-gray-400">{authorName}</span>
      </div>
      <span className="flex-shrink-0 text-[11px] whitespace-nowrap text-gray-400">{time}</span>
    </div>
  );
}
