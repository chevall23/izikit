import { type InputHTMLAttributes, type ReactNode } from 'react';

interface AdminSettingsFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Labeled text field for a settings section. Uncontrolled (`defaultValue`) — mockup only. */
export function AdminSettingsField({ label, id, className, ...props }: AdminSettingsFieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[12px] font-semibold text-neutral-900">
        {label}
      </label>
      <input
        id={inputId}
        className={
          'h-10 rounded-[10px] border border-black/[0.08] bg-gray-50 px-3 text-[13px] text-neutral-900 outline-none focus:border-brand ' +
          (className ?? '')
        }
        {...props}
      />
    </div>
  );
}

/** Dashed drop-zone placeholder (logo/favicon upload) — inert in the mockup. */
export function AdminUploadBox({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-20 items-center justify-center gap-2.5 rounded-[10px] border-2 border-dashed border-black/[0.08] bg-gray-50 text-[13px] text-gray-400"
    >
      {icon}
      {label}
    </button>
  );
}
