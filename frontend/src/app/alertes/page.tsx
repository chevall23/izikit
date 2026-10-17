'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  TrendingUp,
  Eye,
  Sparkles,
  List,
  LayoutGrid,
  MapPin,
  Clock,
  ArrowRight,
  Loader2,
  BellPlus,
  FileSearch,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { cn } from '@/lib/utils';
import { PROPERTY_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from '@/lib/listings';
import {
  COUNTRY_FLAG,
  FREQUENCY_LABEL,
  formatBudget,
  formatDate,
  isMatchToday,
  type AlertListItem,
  type Frequency,
  type RecentAlertMatch,
} from '@/lib/alerts';

interface Counts {
  total: number;
  active: number;
  inactive: number;
}

const MATCHES_PAGE_SIZE = 5;
// The /api/alerts/matches/recent endpoint caps `limit` at 20.
const MATCHES_MAX = 20;

export default function AlertesPage() {
  const user = useUser();
  const { toast } = useToast();

  const [items, setItems] = useState<AlertListItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);

  const [recentItems, setRecentItems] = useState<RecentAlertMatch[]>([]);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [viewedCount, setViewedCount] = useState(0);
  const [matchLimit, setMatchLimit] = useState(MATCHES_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [matchFilter, setMatchFilter] = useState<string>('all');

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    api<{ items: AlertListItem[]; counts: Counts }>('/api/alerts?limit=50')
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setCounts(res.counts);
      })
      .catch((e) => {
        if (cancelled) return;
        toast(e instanceof ApiError ? e.message : 'Impossible de charger les alertes.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ items: RecentAlertMatch[]; monthlyCount: number; viewedCount: number }>(
      `/api/alerts/matches/recent?limit=${matchLimit}`,
    )
      .then((res) => {
        if (cancelled) return;
        setRecentItems(res.items);
        setMonthlyCount(res.monthlyCount);
        setViewedCount(res.viewedCount);
      })
      .catch(() => {
        // best-effort — the rest of the page still works without this section
      })
      .finally(() => {
        if (!cancelled) setLoadingMore(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, matchLimit]);

  function markMatchViewed(alertId: string, matchId: string) {
    void api(`/api/alerts/${alertId}/matches/${matchId}`, {
      method: 'PATCH',
      body: { viewed: true },
    }).catch(() => {
      // best-effort — never blocks navigation to the request detail page
    });
  }

  async function toggleAlert(alert: AlertListItem) {
    if (togglingId) return;
    const next = !alert.active;
    const apply = (active: boolean) => {
      setItems((prev) => prev.map((a) => (a.id === alert.id ? { ...a, active } : a)));
      setCounts((c) => ({
        ...c,
        active: c.active + (active ? 1 : -1),
        inactive: c.inactive + (active ? -1 : 1),
      }));
    };
    setTogglingId(alert.id);
    apply(next);
    try {
      await api(`/api/alerts/${alert.id}`, { method: 'PATCH', body: { active: next } });
    } catch (e) {
      apply(!next);
      toast(e instanceof ApiError ? e.message : "Impossible de mettre à jour l'alerte.", 'error');
    } finally {
      setTogglingId(null);
    }
  }

  function showMoreMatches() {
    setLoadingMore(true);
    setMatchLimit(MATCHES_MAX);
  }

  if (!user) return null;

  if (user.accountType !== 'OWNER_AGENT') {
    return (
      <DashboardShell active="alerts" searchPlaceholder="Rechercher une annonce, un contact…">
        <h1 className="font-sora text-xl font-semibold text-neutral-900 lg:text-[22px]">
          Alerte Secteur
        </h1>
        <p className="mt-2 max-w-xl text-[13.5px] text-gray-500">
          Les alertes secteur sont réservées aux agents. Déposez simplement votre demande : les
          agents de votre zone vous contacteront.
        </p>
      </DashboardShell>
    );
  }

  const visibleMatches =
    matchFilter === 'all' ? recentItems : recentItems.filter((m) => m.alertId === matchFilter);
  // More rows exist only if the last page came back full and the cap is not hit.
  const canShowMore = matchLimit < MATCHES_MAX && recentItems.length >= matchLimit;

  return (
    <DashboardShell active="alerts" searchPlaceholder="Rechercher une annonce, un contact…">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-sora text-xl font-semibold text-neutral-900 lg:text-[22px]">
            Alerte Secteur
          </h1>
          <p className="text-[13.5px] text-gray-400">
            Suivez les nouvelles annonces correspondant à vos critères de recherche par zone.
          </p>
        </div>
        <Link
          href="/alertes/new"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          <Plus className="h-[15px] w-[15px]" aria-hidden />
          <span className="lg:hidden">Nouvelle</span>
          <span className="hidden lg:inline">Nouvelle alerte</span>
        </Link>
      </div>

      {/* STATS BAR */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          {
            label: 'Alertes actives',
            value: counts.active,
            dot: '#376BFF',
            sub: `sur ${counts.total} au total`,
          },
          {
            label: 'Correspondances ce mois',
            value: monthlyCount,
            dot: '#F59E0B',
            sub: (
              <span className="flex items-center gap-1 text-brand">
                <Sparkles className="h-3 w-3" aria-hidden />
                Ce mois-ci
              </span>
            ),
          },
          {
            label: 'Demandes consultées',
            value: viewedCount,
            dot: '#10B981',
            sub: (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden />
                Total
              </span>
            ),
          },
          { label: 'Alertes désactivées', value: counts.inactive, dot: '#EF4444', sub: '—' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-4 lg:p-5">
            <p className="mb-2 text-xs font-medium text-gray-400">{s.label}</p>
            <p className="font-sora mb-1 text-2xl font-semibold text-neutral-900">{s.value}</p>
            <p className="flex items-center text-[11.5px] text-gray-400">
              <span
                className="mr-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: s.dot }}
              />
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      {/* SECTION HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-sora mb-0.5 text-[15px] font-semibold text-neutral-900">
            Mes alertes secteur
          </h2>
          <p className="text-[13px] text-gray-400">
            Cliquez sur une alerte pour voir les correspondances récentes.
          </p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Affichage des alertes">
          {(
            [
              { key: 'list', label: 'Vue liste', Icon: List },
              { key: 'grid', label: 'Vue grille', Icon: LayoutGrid },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
                view === key
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-black/[0.08] text-gray-500 hover:bg-gray-50',
              )}
            >
              <Icon className="h-[13px] w-[13px]" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ALERTS */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white py-14 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" aria-hidden />
          <p className="text-xs text-gray-400">Chargement des alertes…</p>
        </div>
      ) : (
        <div
          className={cn(
            view === 'grid'
              ? 'grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3'
              : 'flex flex-col gap-2.5',
          )}
        >
          {items.map((alert) => {
            const transactionLabel =
              TRANSACTION_TYPE_LABEL[alert.transactionType] ?? alert.transactionType;
            const frequencyLabel = FREQUENCY_LABEL[alert.frequency as Frequency] ?? alert.frequency;
            const criteria: { label: string; highlight?: boolean }[] = [
              ...alert.propertyTypes.map((t) => ({ label: PROPERTY_TYPE_LABEL[t] ?? t })),
              { label: formatBudget(alert.priceMin, alert.priceMax), highlight: true },
            ];
            const lastMatch = alert.lastMatchAt ? formatDate(alert.lastMatchAt) : 'Aucune';
            const toggle = (
              <button
                type="button"
                role="switch"
                aria-checked={alert.active}
                aria-label={`${alert.active ? 'Désactiver' : 'Activer'} l'alerte ${alert.name}`}
                disabled={togglingId === alert.id}
                onClick={() => void toggleAlert(alert)}
                className="flex flex-shrink-0 items-center gap-1.5 disabled:opacity-60"
              >
                <span
                  className={cn(
                    'relative inline-block h-[18px] w-8 rounded-full transition-colors',
                    alert.active ? 'bg-brand' : 'bg-gray-300',
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      'absolute top-[3px] h-3 w-3 rounded-full bg-white',
                      alert.active ? 'right-[3px]' : 'left-[3px]',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'text-xs whitespace-nowrap',
                    alert.active ? 'text-emerald-700' : 'text-gray-400',
                  )}
                >
                  {alert.active ? 'Activée' : 'Désactivée'}
                </span>
              </button>
            );
            const statusBadge = (
              <span
                className={cn(
                  'flex-shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap',
                  alert.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700',
                )}
              >
                {alert.active ? 'Active' : 'Inactive'}
              </span>
            );
            const chips = (
              <div className="flex flex-wrap gap-1.5">
                {criteria.map((c, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-1 text-[11.5px] font-medium',
                      c.highlight ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-neutral-700',
                    )}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            );
            const place = (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                <span>{COUNTRY_FLAG[alert.country] ?? ''}</span>
                <span>{alert.country}</span>
                <span className="text-gray-200">•</span>
                <span>{transactionLabel}</span>
              </p>
            );

            if (view === 'list') {
              return (
                <div
                  key={alert.id}
                  className="flex flex-col gap-3 rounded-2xl bg-white p-4 transition-shadow hover:shadow-md lg:flex-row lg:items-center lg:gap-5 lg:px-5"
                >
                  <Link
                    href={`/alertes/${alert.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-5"
                  >
                    <div className="min-w-0 lg:w-[220px] lg:flex-shrink-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {alert.name}
                        </p>
                        <span className="lg:hidden">{statusBadge}</span>
                      </div>
                      {place}
                    </div>
                    <div className="min-w-0 flex-1">{chips}</div>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:flex-shrink-0 lg:justify-end">
                    <p className="text-xs text-gray-400">
                      Dernière correspondance : <span className="font-medium">{lastMatch}</span>
                    </p>
                    {toggle}
                    <Link
                      href={`/alertes/${alert.id}`}
                      title="Voir l'alerte"
                      aria-label={`Voir l'alerte ${alert.name}`}
                      className="hidden h-[30px] w-[30px] items-center justify-center rounded-md border border-black/[0.08] bg-gray-50 text-neutral-700 lg:flex"
                    >
                      <ChevronRight className="h-[14px] w-[14px]" aria-hidden />
                    </Link>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={alert.id}
                className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 transition-shadow hover:shadow-md"
              >
                <Link href={`/alertes/${alert.id}`} className="flex flex-col gap-3.5">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{alert.name}</p>
                      {place}
                    </div>
                    {statusBadge}
                  </div>
                  {chips}
                </Link>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-xs text-gray-400">
                    Dernière correspondance : <span className="font-medium">{lastMatch}</span>
                  </p>
                  {toggle}
                </div>

                <p className="text-[11.5px] text-gray-400">
                  Créée le {formatDate(alert.createdAt)} · Fréquence : {frequencyLabel}
                </p>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-2xl bg-white p-6 text-center md:col-span-2 lg:col-span-2">
              <BellPlus className="mb-1 h-7 w-7 text-gray-300" aria-hidden />
              <p className="text-sm font-medium text-neutral-700">Aucune alerte pour le moment</p>
              <p className="max-w-xs text-xs text-gray-400">
                Créez votre première alerte secteur pour être notifié des nouvelles opportunités.
              </p>
            </div>
          )}

          {/* New alert card */}
          {view === 'grid' ? (
            <Link
              href="/alertes/new"
              className="flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/[0.08] bg-white p-6"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
                <Plus className="h-5 w-5 text-brand" aria-hidden />
              </div>
              <p className="text-[13.5px] font-semibold text-brand">Créer une nouvelle alerte</p>
              <p className="text-center text-xs text-gray-400">
                Définissez vos critères et recevez
                <br />
                des correspondances en temps réel.
              </p>
            </Link>
          ) : (
            <Link
              href="/alertes/new"
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/[0.08] bg-white px-4 py-3.5 text-[13px] font-semibold text-brand"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Créer une nouvelle alerte
            </Link>
          )}
        </div>
      )}

      {/* RECENT MATCHES */}
      <div className="rounded-2xl bg-white">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <span className="font-sora block text-[15px] font-semibold text-neutral-900">
              Correspondances récentes
            </span>
            <span className="text-[12.5px] text-gray-400">
              {monthlyCount} ce mois · {recentItems.filter((m) => isMatchToday(m.createdAt)).length}{' '}
              nouvelles aujourd&apos;hui
            </span>
          </div>
          {items.length > 1 && (
            <select
              value={matchFilter}
              onChange={(e) => setMatchFilter(e.target.value)}
              aria-label="Filtrer par alerte"
              className="max-w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-1.5 text-[12.5px] font-medium text-neutral-700"
            >
              <option value="all">Toutes les alertes</option>
              {items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          {visibleMatches.map((m, i) => {
            const r = m.propertyRequest;
            const transactionLabel = TRANSACTION_TYPE_LABEL[r.transactionType] ?? r.transactionType;
            const propertyLabel = PROPERTY_TYPE_LABEL[r.propertyType] ?? r.propertyType;
            const isNew = isMatchToday(m.createdAt);
            const budget = (
              <span className="font-sora text-sm font-semibold whitespace-nowrap text-neutral-900">
                {formatBudget(r.budgetMin, r.budgetMax)}
              </span>
            );
            const kind = (
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap text-brand">
                {transactionLabel}
              </span>
            );
            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-start gap-3 border-t border-black/[0.06] px-4 py-3.5 sm:items-center sm:gap-3.5 sm:px-5',
                  i % 2 === 1 && 'bg-[#FAFBFD]',
                )}
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 sm:h-12 sm:w-14">
                  <FileSearch className="h-5 w-5 text-brand" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[13.5px] font-semibold text-neutral-900">
                      Nouvelle demande de client
                    </p>
                    {isNew && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-brand">
                        Nouvelle
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
                      {r.city}
                    </span>
                    <span>{propertyLabel}</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Clock className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
                      {formatDate(m.createdAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                    {budget}
                    {kind}
                  </div>
                </div>
                <div className="hidden flex-shrink-0 flex-col items-end gap-1.5 sm:flex">
                  {budget}
                  {kind}
                </div>
                <Link
                  href={`/demandes/${r.id}`}
                  title="Voir la demande"
                  aria-label="Voir la demande"
                  onClick={() => markMatchViewed(m.alertId, m.id)}
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md border border-black/[0.08] bg-gray-50 text-neutral-700"
                >
                  <Eye className="h-[13px] w-[13px]" aria-hidden />
                </Link>
              </div>
            );
          })}

          {visibleMatches.length === 0 && (
            <div className="border-t border-black/[0.06] px-5 py-10 text-center text-xs text-gray-400">
              Aucune correspondance pour le moment.
            </div>
          )}
        </div>

        {canShowMore && (
          <div className="border-t border-black/[0.06] px-5 py-4 text-center">
            <button
              type="button"
              onClick={showMoreMatches}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand disabled:opacity-60"
            >
              {loadingMore ? (
                <Loader2 className="h-[14px] w-[14px] animate-spin" aria-hidden />
              ) : null}
              Voir plus de correspondances
              <ArrowRight className="h-[14px] w-[14px]" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
