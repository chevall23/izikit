// Real Mobile Money preferences — GET/POST /api/payment-methods,
// PATCH/DELETE /api/payment-methods/[id]. NOT a real card/wallet vault:
// Bictorys exposes no tokenization API, so we only ever store a non-sensitive
// operator + phone pair here to pre-fill future checkouts — never card
// numbers. See .planning/banani/abonnement-paiement.md for the scope
// decision and the user's explicit choice to scope this to Mobile Money.
'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Plus, Smartphone, Star, Trash2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

type Operator = 'ORANGE_MONEY' | 'WAVE' | 'FREE_MONEY';

interface PaymentMethod {
  id: string;
  operator: Operator;
  phone: string;
  label: string | null;
  isDefault: boolean;
}

const OPERATOR_LABEL: Record<Operator, string> = {
  ORANGE_MONEY: 'Orange Money',
  WAVE: 'Wave',
  FREE_MONEY: 'Free Money',
};

export function PaymentMethodsCard() {
  const toast = useToast();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [operator, setOperator] = useState<Operator>('ORANGE_MONEY');
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api<{ methods: PaymentMethod[] }>('/api/payment-methods')
      .then((res) => setMethods(res.methods))
      .catch(() => setMethods([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function addMethod() {
    if (phone.trim().length < 6) {
      toast.toast('Numéro de téléphone invalide', 'error');
      return;
    }
    setSaving(true);
    try {
      await api('/api/payment-methods', {
        method: 'POST',
        body: { operator, phone: phone.trim(), ...(label.trim() ? { label: label.trim() } : {}) },
      });
      setFormOpen(false);
      setPhone('');
      setLabel('');
      setOperator('ORANGE_MONEY');
      toast.toast('Moyen de paiement ajouté', 'success');
      load();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : 'Échec de l’ajout', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id: string) {
    setBusyId(id);
    try {
      await api(`/api/payment-methods/${id}`, { method: 'PATCH', body: { isDefault: true } });
      load();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : 'Échec de la mise à jour', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeMethod(id: string) {
    setBusyId(id);
    try {
      await api(`/api/payment-methods/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : 'Échec de la suppression', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl bg-white p-6 lg:p-7">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-sora text-[15px] font-semibold text-neutral-900">
          Méthodes de paiement
        </h2>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
        >
          {formOpen ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden /> Annuler
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Ajouter
            </>
          )}
        </button>
      </div>
      <p className="mb-4 text-[13px] text-gray-500">
        Enregistrez un numéro Mobile Money pour le pré-remplir au moment de payer. Le paiement par
        carte reste géré via la page de paiement Bictorys, sans enregistrement.
      </p>

      {formOpen && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-black/[0.08] bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-neutral-700">
              Opérateur
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as Operator)}
                className="rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-[13.5px] text-neutral-900"
              >
                {(Object.keys(OPERATOR_LABEL) as Operator[]).map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_LABEL[op]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-neutral-700">
              Numéro de téléphone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+229 97 12 34 56"
                className="rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-[13.5px] text-neutral-900"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-neutral-700">
            Étiquette (optionnel)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. Compte perso"
              className="rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-[13.5px] text-neutral-900"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void addMethod()}
            className="self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {methods === null &&
          [0, 1].map((i) => (
            <div key={i} className="h-[62px] w-full animate-pulse rounded-lg bg-gray-100" />
          ))}

        {methods !== null && methods.length === 0 && (
          <div className="flex items-center gap-4 rounded-lg border border-black/[0.06] bg-gray-50 px-4 py-3.5">
            <div className="flex h-9 w-11 flex-shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-white">
              <CreditCard className="h-4 w-4 text-neutral-400" aria-hidden />
            </div>
            <div className="text-[13px] text-gray-500">Aucun moyen de paiement enregistré.</div>
          </div>
        )}

        {(methods ?? []).map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-4 rounded-lg border border-black/[0.06] bg-gray-50 px-4 py-3.5"
          >
            <div className="flex h-9 w-11 flex-shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-white">
              <Smartphone className="h-4 w-4 text-neutral-600" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium text-neutral-900">
                Mobile Money — {OPERATOR_LABEL[m.operator]}
                {m.label ? ` (${m.label})` : ''}
              </div>
              <div className="text-xs text-gray-500">
                {m.phone}
                {m.isDefault ? ' · Par défaut' : ''}
              </div>
            </div>
            {!m.isDefault && (
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => void setDefault(m.id)}
                title="Définir par défaut"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-brand disabled:opacity-50"
              >
                <Star className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              disabled={busyId === m.id}
              onClick={() => void removeMethod(m.id)}
              title="Supprimer"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
