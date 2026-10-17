'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'no-contact' | 'pending' | 'answered' | 'opted-out';

interface Row {
  id: string;
  contacted: boolean | null;
  comment: string | null;
  submittedAt: string | null;
  optedOutAt: string | null;
  reminderCount: number;
  lastSentAt: string | null;
  createdAt: string;
  request: {
    id: string;
    clientName: string;
    city: string;
    country: string;
    propertyType: string;
    transactionType: string;
  };
  reviews: Array<{ rating: number; agent: { id: string; name: string | null } }>;
}

interface Payload {
  items: Row[];
  counts: { total: number; noContact: number; pending: number; answered: number };
}

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'no-contact', label: 'Sans contact' },
  { key: 'pending', label: 'Sans réponse' },
  { key: 'answered', label: 'Répondus' },
  { key: 'opted-out', label: 'Désinscrits' },
];

function status(r: Row): { label: string; tone: string } {
  if (r.submittedAt) {
    return r.contacted === false
      ? { label: "Aucun agent n'a contacté", tone: 'bg-red-100 text-red-700' }
      : { label: 'Répondu', tone: 'bg-emerald-100 text-emerald-700' };
  }
  if (r.optedOutAt) return { label: 'Désinscrit', tone: 'bg-gray-100 text-gray-600' };
  return { label: 'En attente', tone: 'bg-amber-100 text-amber-700' };
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');

export default function AdminAvisPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setError(null);
    try {
      const qs = f === 'all' ? '' : `?filter=${f}`;
      setData(await api<Payload>(`/api/admin/request-feedback${qs}`));
    } catch {
      setError('Impossible de charger les avis.');
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  return (
    <AdminShell active="avis" searchPlaceholder="Rechercher une demande…">
      <p className="text-[12px] font-semibold text-brand">Administration</p>
      <h1 className="mt-1 text-[22px] font-bold text-gray-900">Avis des demandeurs</h1>
      <p className="mt-1 text-sm text-gray-500">
        Suivi du questionnaire envoyé aux demandeurs : un agent les a-t-il contactés, et quelle note
        lui donnent-ils ?
      </p>

      {data && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Questionnaires', data.counts.total],
            ['Répondus', data.counts.answered],
            ['Sans réponse', data.counts.pending],
            ['Sans contact', data.counts.noContact],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-xl border border-black/[0.08] p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{n}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium',
              filter === f.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-black/[0.08]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Demandeur</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Commentaire</th>
              <th className="px-4 py-3">Relances</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Aucun résultat.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const s = status(r);
              return (
                <tr key={r.id} className="border-t border-black/[0.06] align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.request.clientName}</p>
                    <p className="text-xs text-gray-500">
                      {r.request.propertyType} · {r.request.city}, {r.request.country}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.tone)}>
                      {s.label}
                    </span>
                    <p className="mt-1 text-xs text-gray-500">{fmt(r.submittedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {r.reviews.length === 0
                      ? '—'
                      : r.reviews.map((v) => (
                          <p key={v.agent.id}>
                            {v.agent.name ?? 'Agent'} : <strong>{v.rating}/5</strong>
                          </p>
                        ))}
                  </td>
                  <td className="max-w-[260px] px-4 py-3 text-gray-700">{r.comment ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.reminderCount} · dernier {fmt(r.lastSentAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
