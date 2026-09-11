'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Globe, ShieldCheck, CalendarDays, ChevronDown, RotateCcw } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';

// ── Filter state ─────────────────────────────────────────────────────────────

export interface Filters {
  q: string;
  country: string;
  status: string; // '' | ACTIVE | SUSPENDED
  from: string; // yyyy-mm-dd (inscription)
  to: string; // yyyy-mm-dd
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  country: '',
  status: '',
  from: '',
  to: '',
};

export function hasActiveFilters(f: Filters): boolean {
  return Object.values(f).some((v) => v !== '');
}

/**
 * Non-empty filters as a `&key=value` query fragment (values URI-encoded).
 * `to` is pushed to end-of-day so "au J" still includes signups on day J
 * (the API compares against `createdAt` directly).
 */
export function filtersToQuery(f: Filters): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => {
    if (v !== '') parts.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('q', f.q);
  add('country', f.country);
  add('status', f.status);
  add('from', f.from);
  if (f.to !== '') parts.push(`to=${encodeURIComponent(`${f.to}T23:59:59.999`)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'SUSPENDED', label: 'Suspendu' },
];

const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

function dateSummary(f: Filters): string {
  if (f.from && f.to) return `${fmtDay(f.from)} – ${fmtDay(f.to)}`;
  if (f.from) return `Depuis ${fmtDay(f.from)}`;
  if (f.to) return `Jusqu'au ${fmtDay(f.to)}`;
  return "Date d'inscription";
}

function SelectPill({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== '';
  return (
    <label
      className={cn(
        'relative flex h-10 items-center rounded-[10px] border px-3 text-[13px] font-medium',
        active ? 'border-brand bg-brand/5 text-brand' : 'border-black/[0.08] text-neutral-900',
      )}
    >
      <Icon
        className={cn(
          'mr-2 h-[13px] w-[13px] flex-shrink-0',
          active ? 'text-brand' : 'text-gray-400',
        )}
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-5 whitespace-nowrap outline-none"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-3 h-[13px] w-[13px]',
          active ? 'text-brand' : 'text-gray-400',
        )}
        aria-hidden
      />
    </label>
  );
}

export function UtilisateursFilterBar({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Text/date inputs propagate on a short debounce so typing doesn't fire a
  // request per keystroke; the selects propagate immediately.
  const [draft, setDraft] = useState({ q: value.q, from: value.from, to: value.to });

  useEffect(() => {
    setDraft({ q: value.q, from: value.from, to: value.to });
  }, [value.q, value.from, value.to]);

  useEffect(() => {
    const same = draft.q === value.q && draft.from === value.from && draft.to === value.to;
    if (same) return;
    const t = setTimeout(() => onChange({ ...value, ...draft }), 400);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);

  useEffect(() => {
    if (!dateOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setDateOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDateOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [dateOpen]);

  const active = hasActiveFilters(value);
  const dateActive = value.from !== '' || value.to !== '';

  return (
    <div
      ref={barRef}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-3.5"
    >
      <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-black/[0.08] px-3 text-[13px]">
        <Search className="h-[13px] w-[13px] flex-shrink-0 text-gray-400" aria-hidden />
        <input
          type="search"
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          placeholder="Rechercher nom, email ou téléphone…"
          aria-label="Rechercher un utilisateur"
          className="w-full bg-transparent outline-none"
        />
      </label>

      <SelectPill
        icon={Globe}
        label="Pays"
        value={value.country}
        onChange={(country) => onChange({ ...value, country })}
        options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))}
      />
      <SelectPill
        icon={ShieldCheck}
        label="Statut"
        value={value.status}
        onChange={(status) => onChange({ ...value, status })}
        options={STATUS_OPTIONS}
      />

      <div className="relative">
        <button
          type="button"
          onClick={() => setDateOpen((o) => !o)}
          aria-expanded={dateOpen}
          className={cn(
            'flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium whitespace-nowrap',
            dateActive
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-black/[0.08] text-neutral-900',
          )}
        >
          <CalendarDays
            className={cn('h-[13px] w-[13px]', dateActive ? 'text-brand' : 'text-gray-400')}
            aria-hidden
          />
          {dateActive ? dateSummary(value) : "Date d'inscription"}
          <ChevronDown
            className={cn('h-[13px] w-[13px]', dateActive ? 'text-brand' : 'text-gray-400')}
            aria-hidden
          />
        </button>
        {dateOpen && (
          <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-64 rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-lg">
            <p className="mb-2 text-[12px] font-semibold text-neutral-900">
              Date d&apos;inscription
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px] text-gray-500">
                Du
                <input
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-black/[0.1] px-2.5 text-[13px] outline-none focus:border-brand"
                />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-gray-500">
                Au
                <input
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-black/[0.1] px-2.5 text-[13px] outline-none focus:border-brand"
                />
              </label>
            </div>
            {dateActive && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, from: '', to: '' }))}
                className="mt-2 text-[12px] font-semibold text-brand"
              >
                Effacer
              </button>
            )}
          </div>
        )}
      </div>

      <span className="h-6 w-px bg-black/[0.08]" />
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        disabled={!active}
        className={cn(
          'flex h-10 items-center gap-1.5 px-1 text-[13px] font-semibold whitespace-nowrap',
          active ? 'text-brand hover:underline' : 'cursor-not-allowed text-gray-300',
        )}
      >
        <RotateCcw className="h-[13px] w-[13px]" aria-hidden />
        Réinitialiser
      </button>
    </div>
  );
}
