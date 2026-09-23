'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileStack,
  Upload,
  Download,
  Coins,
  X,
} from 'lucide-react';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { ApiError, api, storeCsrfToken } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

type DocumentType = 'RCCM' | 'TAX_CERTIFICATE' | 'ID_CARD';

type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface UploadedDocument {
  status: DocumentStatus;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface DocumentEntry {
  type: DocumentType;
  document: UploadedDocument | null;
}

interface Stats {
  verified: number;
  pending: number;
  missing: number;
  total: number;
}

const DOCUMENT_TYPES: DocumentType[] = ['RCCM', 'TAX_CERTIFICATE', 'ID_CARD'];

const TYPE_LABELS: Record<DocumentType, string> = {
  RCCM: "Registre de commerce de l'agence (RCCM)",
  TAX_CERTIFICATE: 'Attestation fiscale (IFU / NIF)',
  ID_CARD: "Pièce d'identité nationale (CNIB / Passeport)",
};

// Client-side mirror of the /api/legal-documents/submit route's allowlist —
// used only for the file picker's `accept` attribute; the server remains
// the trust boundary (magic-byte sniff + MIME re-check).
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;

function readCsrfToken(): string {
  if (typeof window === 'undefined') return '';
  const name = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(name);
  if (fromStorage) return fromStorage;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : '';
}

interface SubmitResult {
  documents: DocumentEntry[];
  balance: number;
}

// FormData uploads can't go through the api() wrapper (it always
// JSON.stringifies its body), so they lose its auto-refresh-on-401 — an
// expired 15min access token would otherwise surface as a raw 401 instead
// of transparently refreshing the session. Mirror that behavior here with
// one retry after a session refresh.
async function submitDocuments(files: Partial<Record<DocumentType, File>>): Promise<SubmitResult> {
  async function attempt(): Promise<Response> {
    const form = new FormData();
    for (const [type, file] of Object.entries(files)) {
      if (file) form.append(type, file);
    }
    return fetch(`${API_URL}/api/legal-documents/submit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': readCsrfToken() },
      body: form,
    });
  }

  let res = await attempt();
  if (res.status === 401) {
    const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    if (refreshRes?.ok) {
      const data = await refreshRes.json().catch(() => ({}));
      if (typeof data.csrfToken === 'string') storeCsrfToken(data.csrfToken);
      res = await attempt();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Error ${res.status}`, body);
  }
  return res.json();
}

function StatusBadge({ document }: { document: UploadedDocument | null }) {
  if (!document) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800">
        <AlertCircle className="h-2.5 w-2.5" aria-hidden />
        Manquant
      </span>
    );
  }
  if (document.status === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />
        Vérifié
      </span>
    );
  }
  if (document.status === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800">
        <AlertCircle className="h-2.5 w-2.5" aria-hidden />
        Rejeté
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      <Clock className="h-2.5 w-2.5" aria-hidden />
      En attente
    </span>
  );
}

function DocumentPickerRow({
  entry,
  selectedFile,
  onSelectFile,
  onClearFile,
}: {
  entry: DocumentEntry;
  selectedFile: File | null;
  onSelectFile: (file: File) => void;
  onClearFile: () => void;
}) {
  const { toast } = useToast();
  const { document, type } = entry;
  const locked = document?.status === 'VERIFIED';
  const inputId = `legal-doc-${type}`;

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast('Fichier trop volumineux (max 10 Mo).', 'error');
      return;
    }
    onSelectFile(file);
  }

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[13.5px] font-semibold text-neutral-900">{TYPE_LABELS[type]}</div>
        <div className="text-xs text-gray-500">
          {selectedFile
            ? `Prêt à envoyer · ${selectedFile.name}`
            : document
              ? `Téléversé le ${new Date(document.createdAt).toLocaleDateString('fr-FR')} · ${document.filename}`
              : 'Document requis — non encore déposé'}
          {document?.status === 'REJECTED' && document.rejectionReason && (
            <span className="block text-red-600">{document.rejectionReason}</span>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <StatusBadge document={document} />
        {locked ? (
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[12.5px] font-semibold text-neutral-800 hover:bg-gray-50"
          >
            <Download className="h-3 w-3" aria-hidden />
            Télécharger
          </a>
        ) : selectedFile ? (
          <button
            type="button"
            onClick={onClearFile}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[12.5px] font-semibold text-neutral-800 hover:bg-gray-50"
          >
            <X className="h-3 w-3" aria-hidden />
            Retirer
          </button>
        ) : (
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/[0.08] px-3 py-1.5 text-[12.5px] font-semibold text-neutral-800 hover:bg-gray-50"
          >
            <Upload className="h-3 w-3" aria-hidden />
            {document ? 'Remplacer' : 'Choisir un fichier'}
            <input
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onFileChosen}
            />
          </label>
        )}
      </div>
    </div>
  );
}

export function LegalDocumentsCard() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<DocumentEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ documents: DocumentEntry[]; stats: Stats }>('/api/legal-documents'),
      api<{ balance: number }>('/api/tokens/wallet'),
    ])
      .then(([docsRes, walletRes]) => {
        if (cancelled) return;
        setEntries(docsRes.documents);
        setStats(docsRes.stats);
        setBalance(walletRes.balance);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const editableTypes = DOCUMENT_TYPES.filter(
    (type) => entries.find((e) => e.type === type)?.document?.status !== 'VERIFIED',
  );
  const cost = editableTypes.filter((type) => selectedFiles[type]).length;
  const canSubmit =
    editableTypes.length > 0 && editableTypes.every((type) => selectedFiles[type]) && !submitting;

  function onSelectFile(type: DocumentType, file: File) {
    setSelectedFiles((prev) => ({ ...prev, [type]: file }));
  }

  function onClearFile(type: DocumentType) {
    setSelectedFiles((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const result = await submitDocuments(selectedFiles);
      setEntries((prev) => {
        const byType = new Map(result.documents.map((e) => [e.type, e]));
        return prev.map((e) => byType.get(e.type) ?? e);
      });
      setBalance(result.balance);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              pending: prev.pending + result.documents.length,
              missing: Math.max(0, prev.missing - result.documents.length),
            }
          : prev,
      );
      setSelectedFiles({});
      toast('Documents envoyés — en attente de vérification.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_TOKENS') {
        toast(err.message, 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-start gap-3 rounded-lg bg-brand/5 p-4">
        <FileStack className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" aria-hidden />
        <p className="text-[13px] leading-relaxed text-neutral-700">
          <span className="font-sora block font-semibold text-neutral-900">
            Pourquoi ces documents sont-ils nécessaires ?
          </span>
          La vérification de vos documents légaux renforce la confiance des acheteurs et vendeurs,
          et vous permet d&apos;afficher le badge <strong>Agent Vérifié</strong> sur vos annonces et
          votre profil public. Chaque soumission consomme 1 jeton par document envoyé.
        </p>
      </div>

      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatChip
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden />}
            iconBg="bg-emerald-100"
            value={stats.verified}
            label="Documents validés"
          />
          <StatChip
            icon={<Clock className="h-5 w-5 text-amber-700" aria-hidden />}
            iconBg="bg-amber-100"
            value={stats.pending}
            label="En attente de vérification"
          />
          <StatChip
            icon={<AlertCircle className="h-5 w-5 text-red-700" aria-hidden />}
            iconBg="bg-red-100"
            value={stats.missing}
            label="Document manquant"
          />
          <StatChip
            icon={<Coins className="h-5 w-5 text-brand" aria-hidden />}
            iconBg="bg-brand/10"
            value={balance ?? 0}
            label="Jetons disponibles"
          />
        </div>
      )}

      <section className="rounded-xl bg-white p-6 lg:p-7">
        <h2 className="font-sora text-[15px] font-semibold text-neutral-900">Mes documents</h2>
        <p className="mb-2 text-[13px] text-gray-500">
          Choisissez les documents demandés, puis envoyez-les en une seule fois.
        </p>
        {!loaded && <p className="py-4 text-[13px] text-gray-400">Chargement…</p>}
        <div className="divide-y divide-black/[0.06]">
          {entries.map((entry) => (
            <DocumentPickerRow
              key={entry.type}
              entry={entry}
              selectedFile={selectedFiles[entry.type] ?? null}
              onSelectFile={(file) => onSelectFile(entry.type, file)}
              onClearFile={() => onClearFile(entry.type)}
            />
          ))}
        </div>

        {editableTypes.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 text-[13px] text-gray-600">
              <Coins className="h-3.5 w-3.5 text-brand" aria-hidden />
              Coût de cet envoi :{' '}
              <strong>
                {cost} jeton{cost > 1 ? 's' : ''}
              </strong>
              {balance !== null && <span className="text-gray-400"> · solde : {balance}</span>}
            </div>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void onSubmit()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {submitting ? 'Envoi…' : 'Soumettre les documents'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function StatChip({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-4">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <div className="font-sora text-xl leading-none font-semibold text-neutral-900">{value}</div>
        <div className="text-[11.5px] text-gray-500">{label}</div>
      </div>
    </div>
  );
}
