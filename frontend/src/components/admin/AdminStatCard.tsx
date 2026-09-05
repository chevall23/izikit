import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AdminStatTone = 'brand' | 'warning' | 'success';

const ICON_BG: Record<AdminStatTone, string> = {
  brand: 'bg-brand/10',
  warning: 'bg-amber-500/[0.14]',
  success: 'bg-emerald-500/[0.14]',
};

/**
 * Compact stat tile (icon + label + big value(/unit) + sub-caption), simpler
 * than `AdminKpiCard` (no delta pill, no footer line) — used by the
 * tarification and modération KPI rows and reusable anywhere a plain "here's
 * one number" tile is needed. `tone` colors the icon tile to signal urgency
 * (warning/success) vs a neutral brand-tinted default.
 */
export function AdminStatCard({
  icon,
  label,
  value,
  unit,
  sub,
  tone = 'brand',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: AdminStatTone;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-black/[0.08] bg-white p-5">
      <span
        className={cn(
          'mb-1 flex h-[38px] w-[38px] items-center justify-center rounded-[10px]',
          ICON_BG[tone],
        )}
      >
        {icon}
      </span>
      <div className="text-[12px] font-semibold text-gray-400">{label}</div>
      <div className="text-[26px] leading-none font-extrabold text-neutral-900">
        {value} {unit && <span className="text-[16px] font-semibold text-gray-400">{unit}</span>}
      </div>
      <div className="text-[12px] text-gray-400">{sub}</div>
    </div>
  );
}
