// Jetons balance + monthly usage are now real (same /api/tokens/* endpoints
// as /jetons). "Visites virtuelles" stays illustrative — no domain model for
// 360° virtual tours exists yet, unlike the token wallet. See
// .planning/banani/abonnement-paiement.md for the original scope decision.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins, History, Video } from 'lucide-react';
import { api } from '@/lib/api';

export function TokensCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [usedThisMonth, setUsedThisMonth] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ balance: number }>('/api/tokens/wallet')
      .then((res) => {
        if (!cancelled) setBalance(res.balance);
      })
      .catch(() => undefined);
    api<{ used: number }>('/api/tokens/usage-this-month')
      .then((res) => {
        if (!cancelled) setUsedThisMonth(res.used);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl bg-white p-6 lg:p-7">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-sora text-[15px] font-semibold text-neutral-900">
          Jetons &amp; visites virtuelles
        </h2>
        <Link href="/jetons" className="text-[12.5px] font-semibold text-brand hover:underline">
          Gérer mes jetons →
        </Link>
      </div>
      <p className="mb-2 text-[13px] text-gray-500">
        Votre solde de jetons, mis à jour en temps réel.
      </p>

      <div className="divide-y divide-black/[0.06]">
        <div className="flex items-center gap-4 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <Coins className="h-5 w-5 text-brand" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-medium text-neutral-900">Jetons disponibles</div>
            <div className="text-xs text-gray-500">
              Utilisables pour la vérification de documents et les visites virtuelles
            </div>
          </div>
          <div className="font-sora text-xl font-semibold text-neutral-900">{balance ?? '—'}</div>
        </div>

        <div className="flex items-center gap-4 py-4 opacity-60">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <Video className="h-5 w-5 text-brand" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[13.5px] font-medium text-neutral-900">
              Visites virtuelles ce mois
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Bientôt disponible
              </span>
            </div>
            <div className="text-xs text-gray-500">Fonctionnalité pas encore construite</div>
          </div>
        </div>

        <div className="flex items-center gap-4 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <History className="h-5 w-5 text-brand" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-medium text-neutral-900">
              Jetons utilisés ce mois
            </div>
          </div>
          <div className="font-sora text-xl font-semibold text-neutral-900">
            {usedThisMonth ?? '—'}
          </div>
        </div>
      </div>
    </section>
  );
}
