import { Pencil, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Feature {
  label: string;
  included: boolean;
}

/**
 * One "boost pack" pricing card — name/duration, big price + inline price
 * editor, and a feature checklist. `featured` gets the brand-tinted header +
 * border (the "Populaire" pack). Mockup only — the inline price field/edit
 * pencil/"OK" button are inert.
 */
export function AdminPricingCard({
  name,
  duration,
  price,
  currency,
  featured = false,
  features,
}: {
  name: string;
  duration: string;
  price: string;
  currency: string;
  featured?: boolean;
  features: Feature[];
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border',
        featured ? 'border-brand' : 'border-black/[0.08]',
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-2 border-b p-4',
          featured ? 'border-brand bg-brand/5' : 'border-black/[0.08] bg-gray-50',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-neutral-900">{name}</span>
              {featured && (
                <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                  Populaire
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">{duration}</div>
          </div>
          <button
            type="button"
            aria-label={`Modifier ${name}`}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand/10"
          >
            <Pencil className="h-[13px] w-[13px] text-brand" aria-hidden />
          </button>
        </div>

        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'text-[24px] font-extrabold',
              featured ? 'text-brand' : 'text-neutral-900',
            )}
          >
            {price}
          </span>
          <span className="text-[13px] font-semibold text-gray-400">{currency}</span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <input
            defaultValue={price}
            className="h-8 min-w-0 flex-1 rounded-md border border-black/[0.08] bg-white px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand"
          />
          <button
            type="button"
            className="h-8 flex-shrink-0 rounded-md bg-brand px-2.5 text-[12px] font-semibold text-brand-foreground"
          >
            OK
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {features.map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            {f.included ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" aria-hidden />
            ) : (
              <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" aria-hidden />
            )}
            <span className={cn('text-[12px]', f.included ? 'text-gray-400' : 'text-gray-300')}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
