import { type ReactNode } from 'react';

/**
 * Section card used throughout `/admin/parametres/*`: header (title + optional
 * description), a gapped body, and an optional footer (usually Annuler /
 * Enregistrer). Distinct from the dashboard's `AdminCard` — settings sections
 * have a bordered header/footer and no `headerRight` filter slot.
 */
export function AdminSettingsSection({
  title,
  description,
  headerRight,
  footer,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  /** Optional action rendered top-right of the header (e.g. "Tout enregistrer") — an
   * alternative to `footer` for sections whose Banani source puts the save action up top. */
  headerRight?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.08] px-5 pt-[18px] pb-3.5">
        <div className="min-w-0">
          <h2 className="font-sora text-[15px] font-bold text-neutral-900">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] text-gray-400">{description}</p>}
        </div>
        {headerRight}
      </div>
      <div className={bodyClassName ?? 'flex flex-col gap-[18px] p-5'}>{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2.5 border-t border-black/[0.08] px-5 py-3.5">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Small secondary/primary action buttons for a section footer. */
export function AdminSettingsButton({
  variant = 'secondary',
  icon,
  children,
  ...props
}: {
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={
        variant === 'primary'
          ? 'flex h-[34px] items-center gap-2 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground'
          : 'flex h-[34px] items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-neutral-900'
      }
    >
      {icon}
      {children}
    </button>
  );
}
