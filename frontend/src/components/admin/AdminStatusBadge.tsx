import { cn } from '@/lib/utils';

export type AdminStatusTone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral' | 'violet';

const TONE: Record<AdminStatusTone, string> = {
  success: 'bg-emerald-500/[0.14] text-emerald-600',
  warning: 'bg-amber-500/[0.14] text-amber-600',
  danger: 'bg-red-500/[0.12] text-red-500',
  primary: 'bg-brand/10 text-brand',
  neutral: 'bg-gray-100 text-gray-500',
  violet: 'bg-violet-500/[0.14] text-violet-600',
};

/** Rounded status pill used in the moderation table (En attente / Validée / …). */
export function AdminStatusBadge({ tone, children }: { tone: AdminStatusTone; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
