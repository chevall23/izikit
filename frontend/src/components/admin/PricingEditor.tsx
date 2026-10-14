'use client';

import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { AdminSettingsButton, AdminSettingsSection } from '@/components/admin/AdminSettingsSection';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { PricingDataSchema, tokenPackPriceFcfa, type PricingData } from '@/lib/pricing';
import { usePricingState } from '@/lib/use-pricing';

const PLAN_ROWS = [
  { key: 'FREE', label: 'Gratuit' },
  { key: 'PRO_AGENT', label: 'Pro Agent' },
  { key: 'AGENCY_PREMIUM', label: 'Agence Premium' },
] as const;

const PACK_ROWS = [
  { key: 'STARTER', label: 'Pack Starter' },
  { key: 'STANDARD', label: 'Pack Standard' },
  { key: 'PRO', label: 'Pack Pro' },
] as const;

const INPUT_CLASS =
  'h-8 w-full min-w-[90px] rounded-lg border border-black/[0.08] bg-gray-50 px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand';
const TH_CLASS = 'px-3.5 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400';
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

function toNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

function NumberInput({
  value,
  onChange,
  label,
  disabled,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      step={step ?? '1'}
      disabled={disabled}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(toNumber(e.target.value))}
      className={`${INPUT_CLASS} disabled:opacity-50`}
    />
  );
}

export function PricingEditor() {
  const { pricing, loaded } = usePricingState();
  const { toast } = useToast();
  const [draft, seedDraft] = useState<PricingData>(pricing);
  const dirty = useRef(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Seed from the live config once it has loaded, never over the admin's edits.
  useEffect(() => {
    if (loaded && !dirty.current) seedDraft(pricing);
  }, [loaded, pricing]);

  function setDraft(fn: (d: PricingData) => PricingData) {
    dirty.current = true;
    seedDraft(fn);
  }

  function setPlan(key: 'PRO_AGENT' | 'AGENCY_PREMIUM', patch: { priceFcfa: number }) {
    setDraft((d) => ({ ...d, plans: { ...d.plans, [key]: { ...d.plans[key], ...patch } } }));
  }

  function setQuota(key: (typeof PLAN_ROWS)[number]['key'], value: number | null) {
    setDraft((d) => ({
      ...d,
      plans: { ...d.plans, [key]: { ...d.plans[key], maxActiveListings: value } },
    }));
  }

  function setEntitlement(
    key: (typeof PLAN_ROWS)[number]['key'],
    patch: Partial<{ monthlyTokens: number; includedBoosts: number; maxAlerts: number | null }>,
  ) {
    setDraft((d) => ({ ...d, plans: { ...d.plans, [key]: { ...d.plans[key], ...patch } } }));
  }

  function setLead(key: 'tokensStandard' | 'tokensUrgent', value: number) {
    setDraft((d) => ({ ...d, lead: { ...d.lead, [key]: value } }));
  }
  function setBoost(key: 'tokens7' | 'tokens15' | 'tokens30', value: number) {
    setDraft((d) => ({ ...d, boost: { ...d.boost, [key]: value } }));
  }

  function setPack(
    key: (typeof PACK_ROWS)[number]['key'],
    patch: Partial<{ tokens: number; discountPct: number }>,
  ) {
    setDraft((d) => ({
      ...d,
      token: {
        ...d.token,
        packs: { ...d.token.packs, [key]: { ...d.token.packs[key], ...patch } },
      },
    }));
  }

  async function save() {
    if (!loaded) return;
    const parsed = PricingDataSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => `${i.path.join(' › ') || 'Tarifs'} : ${i.message}`));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await api('/api/admin/pricing', { method: 'PUT', body: parsed.data });
      toast('Tarification enregistrée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsSection
      title="Tarifs des abonnements et des jetons"
      description="Prix des plans, quotas d'annonces, jetons offerts, boosts inclus, alertes, prix de base du jeton et remises des packs."
      footer={
        <AdminSettingsButton
          variant="primary"
          icon={<Save className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => void save()}
          disabled={saving || !loaded}
        >
          {saving ? 'Enregistrement…' : loaded ? 'Enregistrer' : 'Chargement des tarifs…'}
        </AdminSettingsButton>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="bg-gray-50">
              <th className={TH_CLASS}>Plan</th>
              <th className={TH_CLASS}>Prix mensuel (FCFA)</th>
              <th className={TH_CLASS}>Annonces actives max</th>
              <th className={TH_CLASS}>Illimité</th>
              <th className={TH_CLASS}>Jetons offerts / mois</th>
              <th className={TH_CLASS}>Boosts 7 j inclus</th>
              <th className={TH_CLASS}>Alertes max</th>
              <th className={TH_CLASS}>Illimitées</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ROWS.map(({ key, label }) => {
              const plan = draft.plans[key];
              const unlimited = plan.maxActiveListings === null;
              const alertsUnlimited = plan.maxAlerts === null;
              return (
                <tr key={key} className="border-t border-black/[0.05]">
                  <td className="px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                    {label}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {key === 'FREE' ? (
                      <span className="text-[13px] text-gray-400">0 FCFA (fixe)</span>
                    ) : (
                      <NumberInput
                        label={`Prix ${label}`}
                        value={plan.priceFcfa}
                        onChange={(n) => setPlan(key, { priceFcfa: n })}
                      />
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Quota d'annonces ${label}`}
                      value={plan.maxActiveListings ?? 0}
                      disabled={unlimited}
                      onChange={(n) => setQuota(key, n)}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Annonces illimitées ${label}`}
                      checked={unlimited}
                      onChange={(e) => setQuota(key, e.target.checked ? null : 0)}
                      className="h-4 w-4 accent-[var(--color-brand,currentColor)]"
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Jetons offerts par mois ${label}`}
                      value={plan.monthlyTokens}
                      onChange={(n) => setEntitlement(key, { monthlyTokens: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Boosts inclus ${label}`}
                      value={plan.includedBoosts}
                      onChange={(n) => setEntitlement(key, { includedBoosts: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Alertes max ${label}`}
                      value={plan.maxAlerts ?? 0}
                      disabled={alertsUnlimited}
                      onChange={(n) => setEntitlement(key, { maxAlerts: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Alertes illimitées ${label}`}
                      checked={alertsUnlimited}
                      onChange={(e) =>
                        setEntitlement(key, { maxAlerts: e.target.checked ? null : 0 })
                      }
                      className="h-4 w-4 accent-[var(--color-brand,currentColor)]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-[12px] font-semibold text-neutral-900">
          Prix de base du jeton (FCFA)
        </label>
        <NumberInput
          label="Prix de base du jeton"
          value={draft.token.baseFcfa}
          onChange={(n) => setDraft((d) => ({ ...d, token: { ...d.token, baseFcfa: n } }))}
        />
      </div>

      <div className="grid max-w-xl grid-cols-3 gap-3">
        {(
          [
            ['tokens7', 'Boost 7 jours (jetons)'],
            ['tokens15', 'Boost 15 jours (jetons)'],
            ['tokens30', 'Boost 30 jours (jetons)'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-[12px] font-semibold text-neutral-900">{label}</label>
            <NumberInput
              label={label}
              value={draft.boost[key]}
              onChange={(n) => setBoost(key, n)}
            />
          </div>
        ))}
      </div>

      <div className="grid max-w-xl grid-cols-2 gap-3">
        {(
          [
            ['tokensStandard', 'Lead acheteur standard (jetons)'],
            ['tokensUrgent', 'Lead acheteur urgent (jetons)'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-[12px] font-semibold text-neutral-900">{label}</label>
            <NumberInput label={label} value={draft.lead[key]} onChange={(n) => setLead(key, n)} />
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="bg-gray-50">
              <th className={TH_CLASS}>Pack</th>
              <th className={TH_CLASS}>Jetons</th>
              <th className={TH_CLASS}>Remise (%)</th>
              <th className={TH_CLASS}>Prix calculé</th>
            </tr>
          </thead>
          <tbody>
            {PACK_ROWS.map(({ key, label }) => {
              const pack = draft.token.packs[key];
              const price = tokenPackPriceFcfa(draft, key);
              return (
                <tr key={key} className="border-t border-black/[0.05]">
                  <td className="px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap text-neutral-900">
                    {label}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Jetons ${label}`}
                      value={pack.tokens}
                      onChange={(n) => setPack(key, { tokens: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Remise ${label}`}
                      value={pack.discountPct}
                      step="any"
                      onChange={(n) => setPack(key, { discountPct: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5 text-[13px] whitespace-nowrap text-neutral-900">
                    {Number.isFinite(price) ? fcfa(price) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-[12px] text-red-600">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </AdminSettingsSection>
  );
}
