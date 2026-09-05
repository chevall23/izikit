import { type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Rendered to the right of the label, e.g. an "Exigences de sécurité" link. */
  labelSlot?: ReactNode;
  /** Leading icon inside the field box (muted). */
  icon: ReactNode;
  /** Right-aligned static meta text (e.g. "Société", "WhatsApp"). */
  meta?: string;
  /** Right-aligned interactive node (e.g. a show/hide password toggle). Wins over `meta`. */
  trailing?: ReactNode;
}

/**
 * The Banani admin `.field-box`: 50px min-height, gray-50 fill, leading icon,
 * then either a static meta label or a trailing control. Distinct from the
 * split-screen `ui/TextField` (48px, no icon, no meta) — kept separate on purpose.
 */
export function AdminField({
  label,
  labelSlot,
  icon,
  meta,
  trailing,
  id,
  className,
  ...props
}: AdminFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-neutral-900">
          {label}
        </label>
        {labelSlot}
      </div>
      <div className="flex min-h-[50px] items-center justify-between gap-3 rounded-lg border-[1.5px] border-black/[0.08] bg-gray-50 px-3.5 focus-within:border-brand">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-gray-400">
          {icon}
          <input
            id={inputId}
            className={cn(
              'min-w-0 flex-1 bg-transparent py-3 text-[14px] text-neutral-900 outline-none placeholder:text-gray-400',
              className,
            )}
            {...props}
          />
        </div>
        {trailing ? (
          <span className="flex flex-shrink-0 items-center text-gray-400">{trailing}</span>
        ) : meta ? (
          <span className="flex-shrink-0 text-[12px] whitespace-nowrap text-gray-400">{meta}</span>
        ) : null}
      </div>
    </div>
  );
}
