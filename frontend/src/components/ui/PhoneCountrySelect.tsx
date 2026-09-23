'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountryFlag, type FlagCode } from './CountryFlag';

export interface DialCountry {
  code: FlagCode;
  name: string;
  dial: string;
}

// The four markets come first, then common neighbours / diaspora.
export const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'BJ', name: 'Bénin', dial: '+229' },
  { code: 'TG', name: 'Togo', dial: '+228' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225' },
  { code: 'SN', name: 'Sénégal', dial: '+221' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226' },
  { code: 'ML', name: 'Mali', dial: '+223' },
  { code: 'GN', name: 'Guinée', dial: '+224' },
  { code: 'FR', name: 'France', dial: '+33' },
];

export function flagCodeForCountryName(name: string): FlagCode | null {
  return DIAL_COUNTRIES.find((c) => c.name === name)?.code ?? null;
}

// Splits a stored "+229 01 02 03 04" string into a known dial country and the
// local part. Numbers with no recognised "+dial" prefix come back untouched.
export function splitPhone(phone: string): { code: FlagCode | null; local: string } {
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return { code: null, local: trimmed };
  const match = [...DIAL_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => trimmed.startsWith(c.dial));
  if (!match) return { code: null, local: trimmed };
  return { code: match.code, local: trimmed.slice(match.dial.length).trim() };
}

export function PhoneCountrySelect({
  value,
  onChange,
  className,
}: {
  value: FlagCode;
  onChange: (code: FlagCode) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = DIAL_COUNTRIES.find((c) => c.code === value) ?? DIAL_COUNTRIES[0]!;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Indicatif du pays"
        className={cn(
          'flex h-full items-center gap-2 rounded-lg border-[1.5px] border-black/[0.1] bg-gray-50 px-3 py-2.5 text-sm font-semibold text-neutral-900 hover:border-brand/40 focus:border-brand focus:outline-none',
          className,
        )}
      >
        <CountryFlag code={selected.code} size={22} />
        <span>{selected.dial}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-[calc(100%+6px)] left-0 z-30 max-h-[280px] w-[260px] overflow-y-auto rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
        >
          {DIAL_COUNTRIES.map((c) => {
            const active = c.code === value;
            return (
              <li key={c.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-50',
                    active && 'bg-brand/[0.08]',
                  )}
                >
                  <CountryFlag code={c.code} size={24} />
                  <span className="flex-1 font-medium text-neutral-900">{c.name}</span>
                  <span className="text-gray-500">{c.dial}</span>
                  {active && <Check className="h-4 w-4 text-brand" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
