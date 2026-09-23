// Real payment history — GET /api/orders lists the current user's Orders
// (subscription changes, token pack purchases, custom token top-ups) via
// the same cursor-pagination pattern as /api/tokens/transactions. See
// .planning/banani/abonnement-paiement.md for the original scope decision;
// this card was upgraded from illustrative to real per user request.
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface OrderHistoryItem {
  id: string;
  date: string;
  description: string;
  method: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
  amount: number;
  currency: string;
}

const STATUS_LABEL: Record<OrderHistoryItem['status'], string> = {
  PENDING: 'En attente',
  PAID: 'Payé',
  EXPIRED: 'Expiré',
  FAILED: 'Échoué',
  REFUNDED: 'Remboursé',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR')} ${currency === 'XOF' ? 'FCFA' : currency}`;
}

export function PaymentHistoryCard() {
  const [items, setItems] = useState<OrderHistoryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: OrderHistoryItem[] }>('/api/orders?limit=10')
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl bg-white p-6 lg:p-7">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-sora text-[15px] font-semibold text-neutral-900">
          Historique des paiements
        </h2>
      </div>
      <p className="mb-4 text-[13px] text-gray-500">
        Vos paiements d&apos;abonnement et d&apos;achats de jetons.
      </p>

      {items !== null && items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-gray-400">Aucun paiement pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <thead>
              <tr>
                {['Date', 'Description', 'Méthode', 'Statut', 'Montant'].map((h) => (
                  <th
                    key={h}
                    className="font-sora border-b border-black/[0.06] pb-3 text-[11px] font-semibold tracking-wide text-gray-400 uppercase last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-black/[0.06] py-3.5 text-[13px] text-gray-500">
                    {formatDate(row.date)}
                  </td>
                  <td className="border-b border-black/[0.06] py-3.5 text-[13px] font-medium text-neutral-900">
                    {row.description}
                  </td>
                  <td className="border-b border-black/[0.06] py-3.5 text-[13px] text-gray-500">
                    {row.method}
                  </td>
                  <td className="border-b border-black/[0.06] py-3.5 text-[13px] text-neutral-700">
                    {STATUS_LABEL[row.status]}
                  </td>
                  <td className="border-b border-black/[0.06] py-3.5 text-right text-[13px] font-semibold text-neutral-900">
                    {formatAmount(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
              {items === null &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={5} className="border-b border-black/[0.06] py-3.5">
                      <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
