'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Globe,
  MapPin,
  Building,
  Tag,
  Coins,
  CalendarDays,
  ChevronDown,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { PROPERTY_LABEL, TXN_LABEL } from './labels';

// ── Filter state ─────────────────────────────────────────────────────────────

export interface Filters {
  country: string;
  city: string;
  propertyType: string;
  transactionType: string;
  minPrice: string;
  maxPrice: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
}

export const EMPTY_FILTERS: Filters = {
  country: '',
  city: '',
  propertyType: '',
  transactionType: '',
  minPrice: '',
  maxPrice: '',
  from: '',
  to: '',
};

export function hasActiveFilters(f: Filters): boolean {
  return Object.values(f).some((v) => v !== '');
}

/**
 * Non-empty filters as a `&key=value` query fragment (values URI-encoded).
 * `to` is pushed to end-of-day so "au J" still includes listings published
 * on day J (the API compares against `createdAt` directly).
 */
export function filtersToQuery(f: Filters): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => {
    if (v !== '') parts.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('country', f.country);
  add('city', f.city);
  add('propertyType', f.propertyType);
  add('transactionType', f.transactionType);
  add('minPrice', f.minPrice);
  add('maxPrice', f.maxPrice);
  add('from', f.from);
  if (f.to !== '') parts.push(`to=${encodeURIComponent(`${f.to}T23:59:59.999`)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

// ── Summaries for active pills ───────────────────────────────────────────────

const fmtInt = (s: string) => new Intl.NumberFormat('fr-FR').format(Number(s));
const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

function priceSummary(f: Filters): string {
  if (f.minPrice && f.maxPrice) return `${fmtInt(f.minPrice)} – ${fmtInt(f.maxPrice)}`;
  if (f.minPrice) return `≥ ${fmtInt(f.minPrice)}`;
  if (f.maxPrice) return `≤ ${fmtInt(f.maxPrice)}`;
  return 'Prix';
}

function dateSummary(f: Filters): string {
  if (f.from && f.to) return `${fmtDay(f.from)} – ${fmtDay(f.to)}`;
  if (f.from) return `Depuis ${fmtDay(f.from)}`;
  if (f.to) return `Jusqu'au ${fmtDay(f.to)}`;
  return 'Date de publication';
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
  options: string[];
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
          <option key={o} value={o}>
            {o}
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

export function AnnoncesFilterBar({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const [open, setOpen] = useState<null | 'price' | 'date'>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Price / date text inputs propagate on a short debounce so typing doesn't
  // fire a request per keystroke; the selects propagate immediately.
  const [draft, setDraft] = useState({
    minPrice: value.minPrice,
    maxPrice: value.maxPrice,
    from: value.from,
    to: value.to,
  });

  useEffect(() => {
    setDraft({
      minPrice: value.minPrice,
      maxPrice: value.maxPrice,
      from: value.from,
      to: value.to,
    });
  }, [value.minPrice, value.maxPrice, value.from, value.to]);

  useEffect(() => {
    const same =
      draft.minPrice === value.minPrice &&
      draft.maxPrice === value.maxPrice &&
      draft.from === value.from &&
      draft.to === value.to;
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
  const priceActive = value.minPrice !== '' || value.maxPrice !== '';
  const dateActive = value.from !== '' || value.to !== '';

  return (
    <div
      ref={barRef}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-3.5"
    >
      <span className="text-[12px] font-semibold whitespace-nowrap text-gray-400">
        Filtrer par :
      </span>

      <SelectPill
        icon={Globe}
        label="Pays"
        value={value.country}
        onChange={(country) => onChange({ ...value, country, city: '' })}
        options={COUNTRIES.map((c) => c.name)}
      />
      <SelectPill
        icon={MapPin}
        label="Ville"
        value={value.city}
        onChange={(city) => onChange({ ...value, city })}
        options={cities}
        disabled={value.country === ''}
      />
      <SelectPill
        icon={Building}
        label="Type de bien"
        value={value.propertyType}
        onChange={(propertyType) => onChange({ ...value, propertyType })}
        options={Object.keys(PROPERTY_LABEL)}
      />
      <SelectPill
        icon={Tag}
        label="Transaction"
        value={value.transactionType}
        onChange={(transactionType) => onChange({ ...value, transactionType })}
        options={Object.keys(TXN_LABEL)}
      />

      <PopoverPill
        icon={Coins}
        label={priceActive ? priceSummary(value) : 'Prix'}
        active={priceActive}
        isOpen={open === 'price'}
        onToggle={() => setOpen(open === 'price' ? null : 'price')}
      >
        <p className="mb-2 text-[12px] font-semibold text-neutral-900">Prix (FCFA)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            value={draft.minPrice}
            onChange={(e) => setDraft((d) => ({ ...d, minPrice: e.target.value }))}
            className="h-9 w-full rounded-lg border border-black/[0.1] px-2.5 text-[13px] outline-none focus:border-brand"
          />
          <span className="text-gray-300">–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            value={draft.maxPrice}
            onChange={(e) => setDraft((d) => ({ ...d, maxPrice: e.target.value }))}
            className="h-9 w-full rounded-lg border border-black/[0.1] px-2.5 text-[13px] outline-none focus:border-brand"
          />
        </div>
        {priceActive && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, minPrice: '', maxPrice: '' }))}
            className="mt-2 text-[12px] font-semibold text-brand"
          >
            Effacer
          </button>
        )}
      </PopoverPill>

      <PopoverPill
        icon={CalendarDays}
        label={dateActive ? dateSummary(value) : 'Date de publication'}
        active={dateActive}
        isOpen={open === 'date'}
        onToggle={() => setOpen(open === 'date' ? null : 'date')}
      >
        <p className="mb-2 text-[12px] font-semibold text-neutral-900">Date de publication</p>
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
