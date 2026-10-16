'use client';

import { useEffect, useState } from 'react';
import { X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { BOOST_DAYS, boostTokenCost, type BoostDays } from '@/lib/pricing';
import { usePricing } from '@/lib/use-pricing';

interface BoostModalProps {
  listingId: string;
  listingTitle: string;
  onClose: () => void;
  onBoosted: (boostedUntil: string) => void;
}

interface BoostResult {
  boostedUntil: string;
  tokenBalance: number;
  boostCredits: number;
}

// Choose a duration, pay with tokens or with an included 7-day boost.
export function BoostModal({ listingId, listingTitle, onClose, onBoosted }: BoostModalProps) {
  const pricing = usePricing();
  const [days, setDays] = useState<BoostDays>(7);
  const [useIncluded, setUseIncluded] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [credits, setCredits] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ balance: number }>('/api/tokens/wallet')
      .then((res) => {
        if (!cancelled) setBalance(res.balance);
      })
      .catch(() => undefined);
    api<{ subscription: { boostCredits?: number } }>('/api/subscriptions/me')
      .then((res) => {
        if (cancelled) return;
        const n = res.subscription.boostCredits ?? 0;
        setCredits(n);
        if (n > 0) setUseIncluded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // An included boost only covers 7 days.
  const includedAvailable = credits > 0 && days === 7;
  const paysIncluded = useIncluded && includedAvailable;
  const cost = boostTokenCost(pricing, days);
  const notEnough = !paysIncluded && balance !== null && balance < cost;

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<BoostResult>(`/api/listings/${listingId}/boost`, {
        method: 'POST',
        body: { days, useIncluded: paysIncluded },
      });
      onBoosted(res.boostedUntil);
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
          <h3 className="font-sora text-base font-semibold text-neutral-900">Booster l’annonce</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 line-clamp-2 text-[13.5px] text-gray-600">{listingTitle}</p>
        <p className="mb-2 text-[12.5px] text-gray-500">
          Votre annonce est mise en avant avec le badge « Sponsorisé » pendant la durée choisie : en
          haut des résultats de recherche et dans « Annonces à la une » de la page d’accueil.
        </p>
        <p className="mb-4 text-[12px] text-gray-400">
          3 emplacements par page : si plus de 3 annonces sont boostées, elles tournent toutes les
          heures. Il faut au moins une photo et un prix réel.
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {BOOST_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={
                d === days
                  ? 'rounded-lg border-2 border-brand bg-brand/5 px-2 py-2.5 text-center'
                  : 'rounded-lg border-2 border-black/[0.08] px-2 py-2.5 text-center hover:bg-gray-50'
              }
            >
              <span className="block text-[14px] font-semibold text-neutral-900">{d} jours</span>
              <span className="block text-[12px] text-gray-500">
                {boostTokenCost(pricing, d)} jetons
              </span>
            </button>
          ))}
        </div>

        {includedAvailable && (
          <label className="mb-4 flex items-center gap-2 text-[13px] text-neutral-800">
            <input
              type="checkbox"
              checked={useIncluded}
              onChange={(e) => setUseIncluded(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand,currentColor)]"
            />
            Utiliser un boost inclus ({credits} restant{credits > 1 ? 's' : ''})
          </label>
        )}

        <p className="mb-4 text-[13px] text-neutral-700">
          {paysIncluded
            ? 'Coût : 1 boost inclus'
            : `Coût : ${cost} jetons${balance !== null ? ` · Solde : ${balance}` : ''}`}
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
            <Zap className="h-4 w-4" aria-hidden />
            {submitting ? 'Boost en cours…' : 'Confirmer le boost'}
          </Button>
          <Button type="button" variant="social" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
