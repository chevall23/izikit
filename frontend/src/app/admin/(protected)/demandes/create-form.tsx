'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Field, inputCls } from './edit-form';
import { PROPERTY_LABEL, TXN_LABEL, PRIORITIES, FINANCINGS, DELAYS, CLIENT_TYPES } from './labels';

interface CreateState {
  transactionType: string;
  propertyType: string;
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

const INITIAL: CreateState = {
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  priority: 'Normale',
  financing: 'Comptant',
  delay: 'Flexible',
  clientType: 'Particulier',
  country: '',
  city: '',
  landmark: '',
  bedrooms: '',
  salons: '',
  surfaceM2: '',
  capacity: '',
  budgetMin: '',
  budgetMax: '',
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  notes: '',
};

const POS_INT = ['surfaceM2', 'capacity'] as const;
const NON_NEG_INT = ['budgetMin', 'budgetMax'] as const;
const OPT_TEXT = ['landmark', 'bedrooms', 'salons', 'clientEmail', 'notes'] as const;

function buildBody(
  f: CreateState,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  for (const [k, label] of [
    ['country', 'Pays'],
    ['city', 'Ville'],
    ['clientName', 'Nom du demandeur'],
    ['clientPhone', 'Téléphone'],
  ] as const) {
    if (!f[k].trim()) return { ok: false, message: `« ${label} » est obligatoire.` };
  }
  if (f.clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.clientEmail.trim())) {
    return { ok: false, message: 'Email invalide.' };
  }

  const body: Record<string, unknown> = {
    transactionType: f.transactionType,
    propertyType: f.propertyType,
    priority: f.priority,
    financing: f.financing,
    delay: f.delay,
    clientType: f.clientType,
    country: f.country.trim(),
    city: f.city.trim(),
    clientName: f.clientName.trim(),
    clientPhone: f.clientPhone.trim(),
  };
  for (const k of OPT_TEXT) {
    const v = f[k].trim();
    if (v) body[k] = v;
  }
  for (const k of POS_INT) {
    const v = f[k].trim();
    if (!v) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0)
      return { ok: false, message: `« ${k} » doit être un entier positif.` };
    body[k] = n;
  }
  for (const k of NON_NEG_INT) {
    const v = f[k].trim();
    if (!v) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0)
      return { ok: false, message: `« ${k} » doit être un entier ≥ 0.` };
    body[k] = n;
  }
  return { ok: true, body };
}

const OPTS: Record<string, { v: string; l: string }[]> = {
  propertyType: Object.entries(PROPERTY_LABEL).map(([v, l]) => ({ v, l })),
  transactionType: Object.entries(TXN_LABEL).map(([v, l]) => ({ v, l })),
  priority: PRIORITIES.map((v) => ({ v, l: v })),
  financing: FINANCINGS.map((v) => ({ v, l: v })),
  delay: DELAYS.map((v) => ({ v, l: v })),
  clientType: CLIENT_TYPES.map((v) => ({ v, l: v })),
};

export function DemandeCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: (notifiedAgents: number) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CreateState>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const sel = (k: keyof typeof OPTS, label: string) => (
    <Field label={label}>
      <select
        className={inputCls}
        value={form[k as keyof CreateState]}
        onChange={(e) => set(k as keyof CreateState, e.target.value)}
      >
        {OPTS[k]!.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </Field>
  );
  const txt = (k: keyof CreateState, label: string, type = 'text') => (
    <Field label={label}>
      <input
        type={type}
        min={type === 'number' ? 0 : undefined}
        className={inputCls}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  async function submit() {
    if (busy) return;
    const res = buildBody(form);
    if (!res.ok) {
      toast(res.message, 'error');
      return;
    }
    setBusy(true);
    try {
      const out = await api<{ request: { id: string }; notifiedAgents: number }>(
        '/api/admin/property-requests',
        { method: 'POST', body: res.body },
      );
      onCreated(out.notifiedAgents);
    } catch {
      toast('La création a échoué. Réessaie.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {sel('propertyType', 'Type de bien')}
        {sel('transactionType', 'Transaction')}
        {sel('priority', 'Priorité')}
        {sel('clientType', 'Type de demandeur')}
        {txt('country', 'Pays *')}
        {txt('city', 'Ville *')}
        {txt('landmark', 'Quartier / zone')}
        {txt('bedrooms', 'Chambres')}
        {txt('salons', 'Salons')}
        {txt('surfaceM2', 'Surface (m²)', 'number')}
        {txt('capacity', 'Capacité (places)', 'number')}
        {txt('budgetMin', 'Budget min (FCFA)', 'number')}
        {txt('budgetMax', 'Budget max (FCFA)', 'number')}
        {sel('financing', 'Financement')}
        {sel('delay', 'Délai')}
        {txt('clientName', 'Nom du demandeur *')}
        {txt('clientPhone', 'Téléphone *')}
        {txt('clientEmail', 'Email', 'email')}
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
        La demande sera créée sans agent propriétaire ; les agents dont une alerte secteur
        correspond sont notifiés automatiquement.
      </p>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Créer la demande
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
