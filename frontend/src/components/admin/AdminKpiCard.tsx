import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single KPI tile from the admin dashboard's 4-up grid: icon, delta pill,
 * big value, label, and a two-part footer line.
 */
export function AdminKpiCard({
  icon,
  delta,
  deltaTone = 'up',
  value,
  label,
  footLeft,
  footRight,
}: {
  icon: ReactNode;
  delta: string;
  deltaTone?: 'up' | 'warn' | 'neutral';
  value: string;
  label: string;
  footLeft: string;
  footRight: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-xl border border-black/[0.08] bg-white p-[18px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand/10">
          {icon}
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
            deltaTone === 'up'
              ? 'bg-emerald-500/[0.14] text-emerald-600'
              : deltaTone === 'warn'
                ? 'bg-amber-500/[0.16] text-amber-600'
                : 'bg-gray-100 text-gray-500',
          )}
        >
          {delta}
        </span>
      </div>
      <div className="truncate text-[28px] leading-none font-bold text-neutral-900">{value}</div>
      <div className="text-[13px] font-medium text-gray-400">{label}</div>
      <div className="flex items-center justify-between gap-2 text-[12px] whitespace-nowrap text-gray-400">
        <span className="truncate">{footLeft}</span>
        <span className="flex-shrink-0">{footRight}</span>
      </div>
    </div>
  );
}
