'use client';

import { useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';
import type { AlertDetail } from './types';
import { PROPERTY_LABEL, TXN_LABEL, FREQUENCY_LABEL, labelOr } from './labels';

interface FormState {
  name: string;
  transactionType: string;
  frequency: string;
  country: string;
  propertyTypes: string[];
  cities: string[];
  priceMin: string;
  priceMax: string;
  notifWhatsapp: boolean;
  notifEmail: boolean;
  notifSms: boolean;
}

function toForm(a: AlertDetail): FormState {
  return {
    name: a.name,
    transactionType: a.transactionType,
    frequency: a.frequency,
    country: a.country,
    propertyTypes: [...a.propertyTypes],
    cities: [...a.cities],
    priceMin: a.priceMin == null ? '' : String(a.priceMin),
    priceMax: a.priceMax == null ? '' : String(a.priceMax),
    notifWhatsapp: a.notifWhatsapp,
    notifEmail: a.notifEmail,
    notifSms: a.notifSms,
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

type BuildResult = { ok: true; patch: Record<string, unknown> } | { ok: false; message: string };

function buildPatch(form: FormState, a: AlertDetail): BuildResult {
  const patch: Record<string, unknown> = {};

  const name = form.name.trim();
  if (!name) return { ok: false, message: 'Le nom de l’alerte ne peut pas être vide.' };
  if (name !== a.name) patch.name = name;

  if (form.transactionType !== a.transactionType) patch.transactionType = form.transactionType;
  if (form.frequency !== a.frequency) patch.frequency = form.frequency;

  const country = form.country.trim();
  if (!country) return { ok: false, message: 'Le pays cible ne peut pas être vide.' };
  if (country !== a.country) patch.country = country;

  if (form.propertyTypes.length === 0)
    return { ok: false, message: 'Sélectionne au moins un type de bien.' };
  if (!sameSet(form.propertyTypes, a.propertyTypes)) patch.propertyTypes = form.propertyTypes;

  if (form.cities.length === 0) return { ok: false, message: 'Sélectionne au moins une ville.' };
  if (form.cities.length > 10) return { ok: false, message: 'Maximum 10 villes par alerte.' };
  if (!sameSet(form.cities, a.cities)) patch.cities = form.cities;

  for (const k of ['priceMin', 'priceMax'] as const) {
    const raw = form[k].trim();
    const cur = a[k];
    if (raw === '') {
      if (cur != null) patch[k] = null;
      continue;
    }
    const num = Number(raw);
    if (!Number.isInteger(num) || num < 0) {
      return {
        ok: false,
        message: `« ${k === 'priceMin' ? 'Prix min' : 'Prix max'} » doit être un entier positif.`,
      };
    }
    if (num !== cur) patch[k] = num;
  }
  const effMin = 'priceMin' in patch ? (patch.priceMin as number | null) : a.priceMin;
  const effMax = 'priceMax' in patch ? (patch.priceMax as number | null) : a.priceMax;
  if (effMin != null && effMax != null && effMin > effMax) {
    return { ok: false, message: 'Le prix min doit être inférieur ou égal au prix max.' };
  }

  for (const k of ['notifWhatsapp', 'notifEmail', 'notifSms'] as const) {
    if (form[k] !== a[k]) patch[k] = form[k];
  }

  return { ok: true, patch };
}

const inputCls =
  'h-9 rounded-lg border border-black/[0.12] px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-gray-500">
      {label}
      {children}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-full border px-3 text-[12px] font-medium whitespace-nowrap',
        active
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-black/[0.12] bg-white text-neutral-700',
      )}
    >
      {children}
    </button>
  );
}

export function AlerteEditForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: AlertDetail;
  onSaved: (updated: AlertDetail) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(detail));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggle = (k: 'propertyTypes' | 'cities', v: string) =>
    setForm((f) => {
      const has = f[k].includes(v);
      return { ...f, [k]: has ? f[k].filter((x) => x !== v) : [...f[k], v] };
    });

  // City checkboxes = the selected country's known cities ∪ any city already
  // on the alert (so an out-of-list value stays visible and toggleable).
  const cityOptions = useMemo(() => {
    const known = COUNTRIES.find((c) => c.name === form.country)?.cities ?? [];
    return [...new Set([...known, ...form.cities])];
  }, [form.country, form.cities]);

  async function submit() {
    if (busy) return;
    const result = buildPatch(form, detail);
    if (!result.ok) {
      toast(result.message, 'error');
      return;
    }
    if (Object.keys(result.patch).length === 0) {
      toast('Aucune modification à enregistrer.', 'info');
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ alert: AlertDetail }>(`/api/admin/alerts/${detail.id}`, {
        method: 'PATCH',
        body: result.patch,
      });
      toast('Alerte mise à jour.', 'success');
      onSaved(res.alert);
    } catch {
      toast("L'enregistrement a échoué. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom de l’alerte">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Transaction">
          <select
            className={inputCls}
            value={form.transactionType}
            onChange={(e) => set('transactionType', e.target.value)}
          >
            {Object.entries(TXN_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fréquence">
          <select
            className={inputCls}
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value)}
          >
            {Object.entries(FREQUENCY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prix min (FCFA)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.priceMin}
            onChange={(e) => set('priceMin', e.target.value)}
          />
        </Field>
        <Field label="Prix max (FCFA)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.priceMax}
            onChange={(e) => set('priceMax', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Pays cible">
        <select
          className={inputCls}
          value={form.country}
          onChange={(e) => set('country', e.target.value)}
        >
          {COUNTRIES.every((c) => c.name !== form.country) && (
            <option value={form.country}>{form.country}</option>
          )}
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-gray-500">
          Types de bien ({form.propertyTypes.length})
        </span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROPERTY_LABEL).map(([v, l]) => (
            <Chip
              key={v}
              active={form.propertyTypes.includes(v)}
              onClick={() => toggle('propertyTypes', v)}
            >
              {l}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-gray-500">
          Villes ({form.cities.length}/10)
        </span>
        {cityOptions.length === 0 ? (
          <p className="text-[12px] text-gray-400">Choisis d’abord un pays.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cityOptions.map((c) => (
              <Chip key={c} active={form.cities.includes(c)} onClick={() => toggle('cities', c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-gray-500">Canaux de notification</span>
        <div className="flex flex-wrap gap-4 text-[13px] text-neutral-900">
          {(
            [
              ['notifEmail', 'Email'],
              ['notifSms', 'SMS'],
              ['notifWhatsapp', 'WhatsApp'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form[k]}
                onChange={(e) => set(k, e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              {l}
            </label>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Propriétaire : {detail.owner?.name ?? detail.owner?.email ?? '—'}. Type actuel :{' '}
        {labelOr(TXN_LABEL, detail.transactionType)}.
      </p>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          Enregistrer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex h-[38px] items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 text-[14px] font-semibold text-neutral-900 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Annuler
        </button>
      </div>
    </div>
  );
}
