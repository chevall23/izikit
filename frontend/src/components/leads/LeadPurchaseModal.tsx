'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';

export interface LeadContact {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  notes: string | null;
}

interface Props {
  requestId: string;
  summary: string;
  price: number;
  onClose: () => void;
  onPurchased: (contact: LeadContact, tokenBalance: number) => void;
}

// Confirm the purchase of a buyer lead: price, balance, refund conditions.
export function LeadPurchaseModal({ requestId, summary, price, onClose, onPurchased }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ balance: number }>('/api/tokens/wallet')
      .then((res) => {
        if (!cancelled) setBalance(res.balance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const notEnough = balance !== null && balance < price;

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ contact: LeadContact; tokenBalance: number }>(
        `/api/leads/${requestId}/purchase`,
        { method: 'POST', body: { expectedPrice: price } },
      );
      onPurchased(res.contact, res.tokenBalance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-sora text-base font-semibold text-neutral-900">Acheter ce lead</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-[13.5px] text-gray-600">{summary}</p>
        <p className="mb-2 text-[13px] text-neutral-700">
          Coût : {price} jetons{balance !== null ? ` · Solde : ${balance}` : ''}
        </p>
        <p className="mb-4 text-[12.5px] text-gray-500">
          Paiement définitif. Remboursable uniquement si le numéro est invalide, signalé dans les 72
          h suivant l’achat.
        </p>
        {notEnough && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            Solde insuffisant : rechargez vos jetons dans « Jetons & visites VR ».
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" disabled={submitting || notEnough} onClick={() => void confirm()}>
            {submitting ? 'Achat en cours…' : `Acheter pour ${price} jetons`}
          </Button>
          <Button type="button" variant="social" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
