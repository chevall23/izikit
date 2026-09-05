import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Generic bordered card shell used across the admin dashboard widgets
 * (charts, activity feed, alerts, tables). `title`/`subtitle` render the
 * standard header; `headerRight` is an optional trailing control (filter pill,
 * "En direct" tag). Pass `bodyClassName="p-0"` for edge-to-edge content (tables).
 */
export function AdminCard({
  title,
  subtitle,
  headerRight,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-black/[0.08] bg-white p-[18px]', className)}>
      {(title || headerRight) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-sora text-[16px] font-bold text-neutral-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-snug text-gray-400">{subtitle}</p>}
          </div>
          {headerRight}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** The muted rounded-pill filter control seen in card headers. */
export function AdminMiniFilter({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 text-[12px] font-semibold whitespace-nowrap text-gray-700">
      {children}
    </span>
  );
}
