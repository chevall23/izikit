'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Search,
  Globe,
  MapPin,
  Building,
  Tag,
  Activity,
  CalendarDays,
  ChevronDown,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { PROPERTY_LABEL, TXN_LABEL, FREQUENCY_LABEL } from './labels';

// ── Filter state ─────────────────────────────────────────────────────────────

export interface Filters {
  q: string;
  country: string;
  city: string;
  propertyType: string;
  transactionType: string;
  frequency: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  country: '',
  city: '',
  propertyType: '',
  transactionType: '',
  frequency: '',
  from: '',
  to: '',
};

export function hasActiveFilters(f: Filters): boolean {
  return Object.values(f).some((v) => v !== '');
}

/**
 * Non-empty filters as a `&key=value` query fragment (values URI-encoded).
 * `to` is pushed to end-of-day so "au J" still includes alerts created on
 * day J (the API compares against `createdAt` directly).
 */
export function filtersToQuery(f: Filters): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => {
    if (v !== '') parts.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('q', f.q);
  add('country', f.country);
  add('city', f.city);
  add('propertyType', f.propertyType);
  add('transactionType', f.transactionType);
  add('frequency', f.frequency);
  add('from', f.from);
  if (f.to !== '') parts.push(`to=${encodeURIComponent(`${f.to}T23:59:59.999`)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

// ── Summaries for active pills ───────────────────────────────────────────────

const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

function dateSummary(f: Filters): string {
  if (f.from && f.to) return `${fmtDay(f.from)} – ${fmtDay(f.to)}`;
  if (f.from) return `Depuis ${fmtDay(f.from)}`;
  if (f.to) return `Jusqu'au ${fmtDay(f.to)}`;
  return 'Date de création';
}

// ── Pills ────────────────────────────────────────────────────────────────────

function SelectPill({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const active = value !== '';
  return (
    <label
      className={cn(
        'relative flex h-10 items-center rounded-[10px] border px-3 text-[13px] font-medium',
        active ? 'border-brand bg-brand/5 text-brand' : 'border-black/[0.08] text-neutral-900',
        disabled && 'opacity-40',
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
        disabled={disabled}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-5 whitespace-nowrap outline-none disabled:cursor-not-allowed"
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

function PopoverPill({
  icon: Icon,
  label,
  active,
  isOpen,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          'flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium whitespace-nowrap',
          active ? 'border-brand bg-brand/5 text-brand' : 'border-black/[0.08] text-neutral-900',
        )}
      >
        <Icon
          className={cn('h-[13px] w-[13px]', active ? 'text-brand' : 'text-gray-400')}
          aria-hidden
        />
        {label}
        <ChevronDown
          className={cn('h-[13px] w-[13px]', active ? 'text-brand' : 'text-gray-400')}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-64 rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Bar ──────────────────────────────────────────────────────────────────────

const PROPERTY_OPTIONS = Object.entries(PROPERTY_LABEL).map(([value, label]) => ({ value, label }));
const TXN_OPTIONS = Object.entries(TXN_LABEL).map(([value, label]) => ({ value, label }));
const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export function AlerteFilterBar({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const [open, setOpen] = useState<null | 'date'>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Text inputs (search, dates) propagate on a short debounce so typing
  // doesn't fire a request per keystroke; the selects propagate immediately.
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
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cities = COUNTRIES.find((c) => c.name === value.country)?.cities ?? [];
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
          placeholder="Rechercher par nom d'alerte…"
          aria-label="Rechercher une alerte"
          className="w-full bg-transparent outline-none"
        />
      </label>

      <SelectPill
        icon={Globe}
        label="Pays"
        value={value.country}
        onChange={(country) => onChange({ ...value, country, city: '' })}
        options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))}
      />
      <SelectPill
        icon={MapPin}
        label="Ville"
        value={value.city}
        onChange={(city) => onChange({ ...value, city })}
        options={cities.map((c) => ({ value: c, label: c }))}
        disabled={value.country === ''}
      />
      <SelectPill
        icon={Building}
        label="Type de bien"
        value={value.propertyType}
        onChange={(propertyType) => onChange({ ...value, propertyType })}
        options={PROPERTY_OPTIONS}
      />
      <SelectPill
        icon={Tag}
        label="Transaction"
        value={value.transactionType}
        onChange={(transactionType) => onChange({ ...value, transactionType })}
        options={TXN_OPTIONS}
      />
      <SelectPill
        icon={Activity}
        label="Fréquence"
        value={value.frequency}
        onChange={(frequency) => onChange({ ...value, frequency })}
        options={FREQUENCY_OPTIONS}
      />

      <PopoverPill
        icon={CalendarDays}
        label={dateActive ? dateSummary(value) : 'Date de création'}
        active={dateActive}
        isOpen={open === 'date'}
        onToggle={() => setOpen(open === 'date' ? null : 'date')}
      >
        <p className="mb-2 text-[12px] font-semibold text-neutral-900">Date de création</p>
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
      </PopoverPill>

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
