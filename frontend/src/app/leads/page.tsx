'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Phone, Mail, MessageCircle } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { LeadPurchaseModal } from '@/components/leads/LeadPurchaseModal';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

interface Preview {
  id: string;
  propertyType: string;
  transactionType: string;
  country: string;
  city: string;
  landmark: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  priority: string;
  delay: string;
  financing: string;
  createdAt: string;
}

interface Opportunity extends Preview {
  price: number;
  slotsLeft: number;
  purchased: boolean;
}

interface Contact {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  notes: string | null;
}

interface Purchased {
  purchaseId: string;
  requestId: string;
  purchasedAt: string;
  refunded: boolean;
  canReport: boolean;
  request: Preview;
  contact?: Contact;
}

const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

function budgetLabel(min: number | null, max: number | null): string {
  if (min && max) return `${fcfa(min)} – ${fcfa(max)}`;
  if (max) return `Jusqu’à ${fcfa(max)}`;
  if (min) return `À partir de ${fcfa(min)}`;
  return 'Budget non précisé';
}

const summaryOf = (p: Preview) =>
  `${p.propertyType} · ${p.transactionType} · ${p.city}${p.landmark ? ` (${p.landmark})` : ''}`;

export default function LeadsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'opportunities' | 'mine'>('opportunities');
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [mine, setMine] = useState<Purchased[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [buying, setBuying] = useState<Opportunity | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const loadOpps = useCallback(async (next?: string | null) => {
    try {
      const qs = next ? `?cursor=${encodeURIComponent(next)}` : '';
      const res = await api<{ items: Opportunity[]; nextCursor: string | null }>(`/api/leads${qs}`);
      setOpps((prev) => (next ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AGENT_ONLY') setForbidden(true);
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await api<{ items: Purchased[] }>('/api/leads/purchased');
      setMine(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AGENT_ONLY') setForbidden(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadOpps(), loadMine()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadOpps, loadMine]);

  async function report(item: Purchased) {
    if (!window.confirm('Signaler ce numéro comme invalide et être remboursé ?')) return;
    setReporting(item.requestId);
    try {
      await api(`/api/leads/${item.requestId}/report`, {
        method: 'POST',
        body: { reason: 'INVALID_NUMBER' },
      });
      toast('Lead remboursé', 'success');
      await Promise.all([loadMine(), loadOpps()]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessayez.', 'error');
    } finally {
      setReporting(null);
    }
  }

  return (
    <DashboardShell active="leads" searchPlaceholder="Rechercher une annonce, un contact…">
      <div>
        <h1 className="font-sora text-xl font-semibold text-neutral-900 lg:text-[22px]">
          Leads acheteurs
        </h1>
        <p className="mt-1 text-[13.5px] text-gray-500">
          Des acheteurs et locataires qui cherchent un bien. Payez en jetons pour obtenir leurs
          coordonnées — 3 agents au maximum par demande.
        </p>
      </div>

      {forbidden ? (
        <p className="mt-6 text-sm text-gray-600">Cette page est réservée aux comptes agent.</p>
      ) : (
        <>
          <div className="mt-5 flex gap-2">
            {(
              [
                ['opportunities', 'Opportunités'],
                ['mine', 'Mes leads'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-lg px-4 py-2 text-[13.5px] font-medium',
                  tab === key ? 'bg-brand text-brand-foreground' : 'bg-gray-100 text-gray-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

          {!loading && tab === 'opportunities' && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {opps.length === 0 && (
                <p className="text-sm text-gray-500">Aucune demande disponible pour le moment.</p>
              )}
              {opps.map((o) => (
                <div key={o.id} className="rounded-xl border border-black/[0.06] bg-white p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="font-sora text-[15px] font-semibold text-neutral-900">
                      {o.propertyType} · {o.transactionType}
                    </h2>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
                        o.priority === 'Urgent'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {o.priority}
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 text-[13px] text-gray-600">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {o.city}, {o.country}
                    {o.landmark ? ` — ${o.landmark}` : ''}
                  </p>
                  <p className="mt-1 text-[13px] text-neutral-800">
                    {budgetLabel(o.budgetMin, o.budgetMax)}
                  </p>
                  <p className="mt-1 text-[12.5px] text-gray-500">
                    Délai : {o.delay} · Financement : {o.financing}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-[12.5px] text-gray-500">
                      {o.slotsLeft} place{o.slotsLeft > 1 ? 's' : ''} restante
                      {o.slotsLeft > 1 ? 's' : ''} · {o.price} jetons
                    </span>
                    <Button type="button" disabled={o.purchased} onClick={() => setBuying(o)}>
                      {o.purchased ? 'Déjà acheté' : 'Acheter'}
                    </Button>
                  </div>
                </div>
              ))}
              {cursor && (
                <div className="md:col-span-2">
                  <Button type="button" variant="social" onClick={() => void loadOpps(cursor)}>
                    Charger plus
                  </Button>
                </div>
              )}
            </div>
          )}

          {!loading && tab === 'mine' && (
            <div className="mt-5 grid gap-4">
              {mine.length === 0 && (
                <p className="text-sm text-gray-500">Vous n’avez encore acheté aucun lead.</p>
              )}
              {mine.map((m) => (
                <div
                  key={m.purchaseId}
                  className="rounded-xl border border-black/[0.06] bg-white p-5"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-sora text-[15px] font-semibold text-neutral-900">
                        {summaryOf(m.request)}
                      </h2>
                      <p className="text-[12.5px] text-gray-500">
                        Acheté le {new Date(m.purchasedAt).toLocaleDateString('fr-FR')} ·{' '}
                        {budgetLabel(m.request.budgetMin, m.request.budgetMax)}
                      </p>
                    </div>
                    {m.refunded && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-700">
                        Remboursé
                      </span>
                    )}
                  </div>
                  {m.contact && (
                    <div className="space-y-1.5 text-[13.5px] text-neutral-800">
                      <p className="font-medium">
                        {m.contact.clientName} · {m.contact.clientType}
                      </p>
                      <p className="flex flex-wrap items-center gap-3">
                        <a
                          href={`tel:${m.contact.clientPhone}`}
                          className="inline-flex items-center gap-1.5 text-brand"
                        >
                          <Phone className="h-4 w-4" aria-hidden />
                          {m.contact.clientPhone}
                        </a>
                        <a
                          href={`https://wa.me/${m.contact.clientPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-brand"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden />
                          WhatsApp
                        </a>
                        {m.contact.clientEmail && (
                          <a
                            href={`mailto:${m.contact.clientEmail}`}
                            className="inline-flex items-center gap-1.5 text-brand"
                          >
                            <Mail className="h-4 w-4" aria-hidden />
                            {m.contact.clientEmail}
                          </a>
                        )}
                      </p>
                      {m.contact.notes && (
                        <p className="text-[13px] text-gray-600">{m.contact.notes}</p>
                      )}
                    </div>
                  )}
                  {m.canReport && (
                    <div className="mt-4">
                      <Button
                        type="button"
                        variant="social"
                        disabled={reporting === m.requestId}
                        onClick={() => void report(m)}
                      >
                        {reporting === m.requestId ? 'Signalement…' : 'Signaler un numéro invalide'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {buying && (
        <LeadPurchaseModal
          requestId={buying.id}
          summary={summaryOf(buying)}
          price={buying.price}
          onClose={() => setBuying(null)}
          onPurchased={() => {
            setBuying(null);
            toast('Lead acheté', 'success');
            setTab('mine');
            void Promise.all([loadMine(), loadOpps()]);
          }}
        />
      )}
    </DashboardShell>
  );
}
