'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import type { RequestDetail } from './types';
import {
  PROPERTY_LABEL,
  TXN_LABEL,
  PRIORITIES,
  FINANCINGS,
  DELAYS,
  CLIENT_TYPES,
  labelOr,
} from './labels';

// String-form mirror of the editable RequestDetail fields.
interface FormState {
  propertyType: string;
  transactionType: string;
  priority: string;
  financing: string;
  delay: string;
  clientType: string;
  country: string;
  city: string;
  landmark: string;
  bedrooms: string;
  salons: string;
  surfaceM2: string;
  capacity: string;
  budgetMin: string;
  budgetMax: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  notes: string;
}

const NULLABLE_TEXT = ['landmark', 'bedrooms', 'salons', 'clientEmail', 'notes'] as const;
const REQUIRED_TEXT = ['country', 'city', 'clientName', 'clientPhone'] as const;
const NUMBERS = ['surfaceM2', 'capacity', 'budgetMin', 'budgetMax'] as const;
const ENUMS = [
  'propertyType',
  'transactionType',
  'priority',
  'financing',
  'delay',
  'clientType',
] as const;

function toForm(d: RequestDetail): FormState {
  const s = (v: string | null) => v ?? '';
  const n = (v: number | null) => (v == null ? '' : String(v));
  return {
    propertyType: d.propertyType,
    transactionType: d.transactionType,
    priority: d.priority,
    financing: d.financing,
    delay: d.delay,
    clientType: d.clientType,
    country: d.country,
    city: d.city,
    landmark: s(d.landmark),
    bedrooms: s(d.bedrooms),
    salons: s(d.salons),
    surfaceM2: n(d.surfaceM2),
    capacity: n(d.capacity),
    budgetMin: n(d.budgetMin),
    budgetMax: n(d.budgetMax),
    clientName: d.clientName,
    clientPhone: d.clientPhone,
    clientEmail: s(d.clientEmail),
    notes: s(d.notes),
  };
}

const FIELD_LABEL: Record<string, string> = {
  country: 'Pays',
  city: 'Ville',
  clientName: 'Nom du demandeur',
  clientPhone: 'Téléphone',
  surfaceM2: 'Surface',
  capacity: 'Capacité',
  budgetMin: 'Budget min',
  budgetMax: 'Budget max',
};

type BuildResult = { ok: true; patch: Record<string, unknown> } | { ok: false; message: string };

function buildPatch(form: FormState, d: RequestDetail): BuildResult {
  const patch: Record<string, unknown> = {};

  for (const k of ENUMS) {
    if (form[k] !== d[k]) patch[k] = form[k];
  }
  for (const k of REQUIRED_TEXT) {
    const v = form[k].trim();
    if (!v) return { ok: false, message: `Le champ « ${FIELD_LABEL[k]} » ne peut pas être vide.` };
    if (v !== d[k]) patch[k] = v;
  }
  for (const k of NULLABLE_TEXT) {
    const v = form[k].trim();
    const cur = (d[k] as string | null) ?? '';
    if (v !== cur) patch[k] = v === '' ? null : v;
  }
  for (const k of NUMBERS) {
    const raw = form[k].trim();
    const cur = d[k] as number | null;
    if (raw === '') {
      if (cur != null) patch[k] = null;
      continue;
    }
    const num = Number(raw);
    if (!Number.isInteger(num) || num < 0) {
      return { ok: false, message: `« ${FIELD_LABEL[k]} » doit être un entier positif.` };
    }
    if (num !== cur) patch[k] = num;
  }
  return { ok: true, patch };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-gray-500">
      {label}
      {children}
    </label>
  );
}

export const inputCls =
  'h-9 rounded-lg border border-black/[0.12] px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand';

export function DemandeEditForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: RequestDetail;
  onSaved: (updated: RequestDetail) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(detail));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const enumOptions = useMemo(
    () => ({
      propertyType: Object.entries(PROPERTY_LABEL).map(([v, l]) => ({ v, l })),
      transactionType: Object.entries(TXN_LABEL).map(([v, l]) => ({ v, l })),
      priority: PRIORITIES.map((v) => ({ v, l: v })),
      financing: FINANCINGS.map((v) => ({ v, l: v })),
      delay: DELAYS.map((v) => ({ v, l: v })),
      clientType: CLIENT_TYPES.map((v) => ({ v, l: v })),
    }),
    [],
  );

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
      const res = await api<{ request: RequestDetail }>(
        `/api/admin/property-requests/${detail.id}`,
        { method: 'PATCH', body: result.patch },
      );
      toast('Demande mise à jour.', 'success');
      onSaved(res.request);
    } catch {
      toast("L'enregistrement a échoué. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type de bien">
          <select
            className={inputCls}
            value={form.propertyType}
            onChange={(e) => set('propertyType', e.target.value)}
          >
            {enumOptions.propertyType.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transaction">
          <select
            className={inputCls}
            value={form.transactionType}
            onChange={(e) => set('transactionType', e.target.value)}
          >
            {enumOptions.transactionType.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorité">
          <select
            className={inputCls}
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
          >
            {enumOptions.priority.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type de demandeur">
          <select
            className={inputCls}
            value={form.clientType}
            onChange={(e) => set('clientType', e.target.value)}
          >
            {enumOptions.clientType.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pays">
          <input
            className={inputCls}
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
          />
        </Field>
        <Field label="Ville">
          <input
            className={inputCls}
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <Field label="Quartier / zone">
          <input
            className={inputCls}
            value={form.landmark}
            onChange={(e) => set('landmark', e.target.value)}
          />
        </Field>
        <Field label="Chambres">
          <input
            className={inputCls}
            value={form.bedrooms}
            onChange={(e) => set('bedrooms', e.target.value)}
          />
        </Field>
        <Field label="Salons">
          <input
            className={inputCls}
            value={form.salons}
            onChange={(e) => set('salons', e.target.value)}
          />
        </Field>
        <Field label="Surface (m²)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.surfaceM2}
            onChange={(e) => set('surfaceM2', e.target.value)}
          />
        </Field>
        <Field label="Capacité (places)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
        <Field label="Budget min (FCFA)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.budgetMin}
            onChange={(e) => set('budgetMin', e.target.value)}
          />
        </Field>
        <Field label="Budget max (FCFA)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.budgetMax}
            onChange={(e) => set('budgetMax', e.target.value)}
          />
        </Field>
        <Field label="Financement">
          <select
            className={inputCls}
            value={form.financing}
            onChange={(e) => set('financing', e.target.value)}
          >
            {enumOptions.financing.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Délai">
          <select
            className={inputCls}
            value={form.delay}
            onChange={(e) => set('delay', e.target.value)}
          >
            {enumOptions.delay.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nom du demandeur">
          <input
            className={inputCls}
            value={form.clientName}
            onChange={(e) => set('clientName', e.target.value)}
          />
        </Field>
        <Field label="Téléphone">
          <input
            className={inputCls}
            value={form.clientPhone}
            onChange={(e) => set('clientPhone', e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputCls}
            value={form.clientEmail}
            onChange={(e) => set('clientEmail', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          rows={4}
          className="rounded-lg border border-black/[0.12] px-2.5 py-2 text-[13px] text-neutral-900 outline-none focus:border-brand"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      <p className="text-[11px] text-gray-400">
        Type actuel : {labelOr(PROPERTY_LABEL, detail.propertyType)}. Les équipements ne sont pas
        modifiables ici.
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
