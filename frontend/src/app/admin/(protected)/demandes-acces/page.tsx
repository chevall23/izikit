'use client';

import { useEffect, useState, useCallback } from 'react';
import { Mail, Phone, Calendar, Check, X, Clock3 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Status = 'PENDING_EMAIL' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

const STATUS_LABEL: Record<Status, string> = {
  PENDING_EMAIL: 'Email non vérifié',
  PENDING_REVIEW: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
};
const DECISION_ERROR_MESSAGES: Record<string, string> = {
  REQUEST_NOT_PENDING: 'Cette demande a déjà été traitée.',
  EMAIL_ALREADY_REGISTERED: 'Un utilisateur avec cet email existe déjà.',
  PHONE_ALREADY_REGISTERED: 'Un utilisateur avec ce téléphone existe déjà.',
  ACCESS_REQUEST_NOT_FOUND: 'Cette demande est introuvable.',
  ADMIN_REQUIRED: 'Action réservée aux super-administrateurs.',
};

const STATUS_TONE: Record<Status, AdminStatusTone> = {
  PENDING_EMAIL: 'neutral',
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: Status;
  emailVerifiedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

const TABS: { key: Status; label: string }[] = [
  { key: 'PENDING_REVIEW', label: 'En attente' },
  { key: 'APPROVED', label: 'Approuvées' },
  { key: 'REJECTED', label: 'Rejetées' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminDemandesAccesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Status>('PENDING_REVIEW');
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(
    (status: Status) => {
      setLoading(true);
      api<{ items: AccessRequest[] }>(`/api/admin/access-requests?status=${status}&limit=50`)
        .then((res) => setItems(res.items))
        .catch((e) =>
          toast(
            e instanceof ApiError
              ? (DECISION_ERROR_MESSAGES[e.code] ?? 'Impossible de charger les demandes.')
              : 'Impossible de charger les demandes.',
            'error',
          ),
        )
        .finally(() => setLoading(false));
    },
    [toast],
  );

  useEffect(() => {
    load(tab);
    setOpenId(null);
    setRejecting(false);
    setRejectReason('');
  }, [tab, load]);

  const selected = items.find((r) => r.id === openId) ?? null;

  async function approve(id: string) {
    setDeciding(true);
    try {
      await api(`/api/admin/access-requests/${id}/approve`, { method: 'POST' });
      toast('Compte administrateur créé.', 'success');
      setOpenId(null);
      load(tab);
    } catch (e) {
      toast(
        e instanceof ApiError
          ? (DECISION_ERROR_MESSAGES[e.code] ?? "Impossible d'approuver cette demande.")
          : "Impossible d'approuver cette demande.",
        'error',
      );
    } finally {
      setDeciding(false);
    }
  }

  async function reject(id: string) {
    setDeciding(true);
    try {
      await api(`/api/admin/access-requests/${id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason || undefined },
      });
      toast('Demande rejetée.', 'success');
      setOpenId(null);
      load(tab);
    } catch (e) {
      toast(
        e instanceof ApiError
          ? (DECISION_ERROR_MESSAGES[e.code] ?? 'Impossible de rejeter cette demande.')
          : 'Impossible de rejeter cette demande.',
        'error',
      );
    } finally {
      setDeciding(false);
      setRejecting(false);
      setRejectReason('');
    }
  }

  return (
    <AdminShell active="access-requests" searchPlaceholder="Rechercher une demande d'accès admin…">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Administration · Sécurité</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Demandes d&apos;accès admin
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Approuvez ou rejetez les demandes de création de compte administrateur.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] px-[18px] py-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-[30px] items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                tab === t.key ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {['Demandeur', 'Email', 'Téléphone', 'Statut', 'Soumise le', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune demande dans cette catégorie.
                  </td>
                </tr>
              ) : (
                items.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
                      {r.name}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-neutral-700">{r.email}</td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {r.phone}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminDrawer
        open={selected != null}
        onClose={() => setOpenId(null)}
        title={selected?.name ?? ''}
        titleExtra={
          selected && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {STATUS_LABEL[selected.status]}
            </span>
          )
        }
        footer={
          selected &&
          selected.status === 'PENDING_REVIEW' && (
            <>
              {rejecting ? (
                <div className="flex flex-col gap-2.5">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motif du rejet (optionnel)"
                    rows={2}
                    className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-brand"
                  />
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRejecting(false)}
                      className="flex h-[38px] flex-1 items-center justify-center rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={deciding}
                      onClick={() => reject(selected.id)}
                      className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Confirmer le rejet
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => approve(selected.id)}
                    className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Approuver
                  </button>
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => setRejecting(true)}
                    className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Rejeter
                  </button>
                </div>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="flex flex-col gap-3">
              <DetailRow
                icon={<Mail className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Email"
                value={selected.email}
              />
              <DetailRow
                icon={<Phone className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Téléphone"
                value={selected.phone}
              />
              <DetailRow
                icon={<Calendar className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Soumise le"
                value={formatDate(selected.createdAt)}
              />
              <DetailRow
                icon={<Clock3 className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Email vérifié"
                value={selected.emailVerifiedAt ? formatDate(selected.emailVerifiedAt) : 'Non'}
              />
            </div>
            {selected.status === 'REJECTED' && selected.rejectionReason && (
              <div className="rounded-lg bg-red-50 p-3.5 text-[13px] text-red-600">
                Motif : {selected.rejectionReason}
              </div>
            )}
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="text-[13px] font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
