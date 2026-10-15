'use client';

import { useEffect, useState } from 'react';
import { Check, XCircle, Zap } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import {
  PLAN_CATALOG,
  PLAN_KEYS,
  SUBSCRIPTION_CURRENCY,
  type PlanKey,
} from '@/lib/subscription-plans';
import {
  alertsQuotaLabel,
  boostsIncludedLabel,
  listingsQuotaLabel,
  planIncludedBoosts,
  planMaxAlerts,
  planMaxListings,
  planMonthlyTokens,
  planPriceFcfa,
  tokensPerMonthLabel,
} from '@/lib/pricing';
import { usePricing } from '@/lib/use-pricing';
import { getRenewalState } from '@/lib/subscription-renewal';
import { PasswordConfirmModal } from './PasswordConfirmModal';

interface Subscription {
  planKey: PlanKey;
  status: 'ACTIVE' | 'CANCELED' | 'GRACE' | 'TRIAL' | 'EXPIRED';
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  trialStartedAt?: string | null;
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export function SubscriptionCard() {
  const { toast } = useToast();
  const pricing = usePricing();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [trialEligible, setTrialEligible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ subscription: Subscription; trialEligible?: boolean }>('/api/subscriptions/me')
      .then((res) => {
        if (cancelled) return;
        setSubscription(res.subscription);
        setTrialEligible(res.trialEligible === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const currentPlanKey = subscription?.planKey ?? 'FREE';
  const currentPlan = PLAN_CATALOG[currentPlanKey];
  const renewal = getRenewalState(subscription, new Date());
  const isTrial = subscription?.status === 'TRIAL';
  const trialDaysLeft =
    isTrial && subscription?.currentPeriodEnd
      ? Math.max(
          0,
          Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / 86_400_000),
        )
      : 0;

  async function changeToFree() {
    setBusyPlan('FREE');
    try {
      const res = await api<{ subscription: Subscription }>('/api/subscriptions/change-plan', {
        method: 'POST',
        body: { planKey: 'FREE' },
      });
      setSubscription(res.subscription);
      toast('Plan Gratuit activé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setBusyPlan(null);
    }
  }

  async function startTrial() {
    setBusyPlan('PRO_AGENT');
    try {
      const res = await api<{ subscription: Subscription }>('/api/subscriptions/trial', {
        method: 'POST',
      });
      setSubscription(res.subscription);
      setTrialEligible(false);
      toast('Essai Pro de 14 jours activé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setBusyPlan(null);
    }
  }

  async function upgradeTo(planKey: PlanKey) {
    setBusyPlan(planKey);
    try {
      const res = await api<{ paymentUrl: string }>('/api/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          amount: planPriceFcfa(pricing, planKey),
          currency: SUBSCRIPTION_CURRENCY,
          metadata: { kind: 'subscription_plan_change', planKey },
        },
      });
      window.location.href = res.paymentUrl;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
      setBusyPlan(null);
    }
  }

  async function confirmCancelSubscription() {
    try {
      const res = await api<{ subscription: Subscription }>('/api/subscriptions/cancel', {
        method: 'POST',
      });
      setSubscription(res.subscription);
      toast('Abonnement résilié.', 'success');
      setConfirmCancel(false);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    }
  }

  function onPlanAction(planKey: PlanKey) {
    if (planKey === currentPlanKey) {
      if (renewal.canRenew) void upgradeTo(planKey);
      return;
    }
    if (planKey === 'FREE') void changeToFree();
    else void upgradeTo(planKey);
  }

  return (
    <>
      <div className="mb-5 rounded-xl bg-gradient-to-br from-brand to-brand/80 p-7">
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
          <Zap className="h-2.5 w-2.5" aria-hidden />
          {isTrial ? 'Essai Pro' : 'Plan actif'}
        </div>
        <h2 className="font-sora mb-1.5 text-xl font-semibold text-white">{currentPlan.label}</h2>
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-sora text-3xl font-semibold text-white">
            {isTrial ? 'Gratuit' : formatFcfa(planPriceFcfa(pricing, currentPlan.key))}
          </span>
          {isTrial && <span className="text-sm text-white/75">pendant l’essai</span>}
          {!isTrial && planPriceFcfa(pricing, currentPlan.key) > 0 && (
            <span className="text-sm text-white/75">par mois, taxes comprises</span>
          )}
        </div>
        {subscription?.currentPeriodEnd && (
          <p className="text-[13px] text-white/80">
            {subscription.status === 'GRACE' && renewal.graceDeadline
              ? `Expiré le ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')} — renouvelez avant le ${renewal.graceDeadline.toLocaleDateString('fr-FR')} pour garder vos annonces`
              : subscription.status === 'CANCELED'
                ? `Résilié — accès jusqu'au ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                : isTrial
                  ? `Essai gratuit — se termine le ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')} (${trialDaysLeft} jour${trialDaysLeft > 1 ? 's' : ''} restant${trialDaysLeft > 1 ? 's' : ''})`
                  : `Renouvellement le ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}`}
          </p>
        )}
      </div>

      {trialEligible && currentPlanKey === 'FREE' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div>
            <h3 className="font-sora text-[15px] font-semibold text-neutral-900">
              Essayez Pro gratuitement pendant 14 jours
            </h3>
            <p className="text-[13px] text-gray-600">
              30 annonces et 10 alertes secteur, sans carte bancaire. Les jetons et le boost inclus
              sont accordés à l’abonnement.
            </p>
          </div>
          <button
            type="button"
            disabled={busyPlan !== null}
            onClick={() => void startTrial()}
            className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {busyPlan === 'PRO_AGENT' ? 'Activation…' : 'Démarrer l’essai'}
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_KEYS.map((key) => {
          const plan = PLAN_CATALOG[key];
          const isCurrent = key === currentPlanKey;
          const isRenewal = isCurrent && renewal.canRenew;
          return (
            <div
              key={key}
              className={
                isCurrent
                  ? 'relative rounded-xl border-2 border-brand bg-white p-6'
                  : 'relative rounded-xl border-2 border-transparent bg-white p-6'
              }
            >
              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10px] font-semibold whitespace-nowrap text-white">
                  Plan actuel
                </span>
              )}
              <h3 className="font-sora text-[15px] font-semibold text-neutral-900">{plan.label}</h3>
              <p className="mb-4 text-xs text-gray-500">{plan.description}</p>
              <div
                className={
                  isCurrent
                    ? 'font-sora text-2xl font-semibold text-brand'
                    : 'font-sora text-2xl font-semibold text-neutral-900'
                }
              >
                {formatFcfa(planPriceFcfa(pricing, plan.key))}
              </div>
              <p className="mb-5 text-xs text-gray-500">
                {planPriceFcfa(pricing, plan.key) === 0 ? 'À vie' : 'par mois'}
              </p>
              <ul className="mb-5 flex flex-col gap-2">
                {[
                  listingsQuotaLabel(planMaxListings(pricing, plan.key)),
                  tokensPerMonthLabel(planMonthlyTokens(pricing, plan.key)),
                  boostsIncludedLabel(planIncludedBoosts(pricing, plan.key)),
                  alertsQuotaLabel(planMaxAlerts(pricing, plan.key)),
                  ...plan.features,
                ]
                  .filter((feature): feature is string => feature !== null)
                  .map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-[12.5px] text-neutral-700"
                    >
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-2.5 w-2.5 text-emerald-700" aria-hidden />
                      </span>
                      {feature}
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                disabled={busyPlan !== null}
                onClick={() => onPlanAction(key)}
                className={
                  isCurrent && !isRenewal
                    ? 'w-full cursor-default rounded-lg border border-brand px-4 py-2.5 text-[13px] font-semibold text-brand'
                    : 'w-full rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50'
                }
              >
                {isCurrent
                  ? isRenewal
                    ? busyPlan === key
                      ? 'Traitement…'
                      : isTrial
                        ? 'Passer à Pro'
                        : 'Renouveler'
                    : 'Plan actuel'
                  : busyPlan === key
                    ? 'Traitement…'
                    : planPriceFcfa(pricing, plan.key) === 0
                      ? 'Rétrograder'
                      : `Passer à ${plan.label}`}
              </button>
            </div>
          );
        })}
      </div>

      {currentPlanKey !== 'FREE' && subscription?.status === 'ACTIVE' && (
        <section className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="font-sora text-[15px] font-semibold text-red-800">
            Résilier l&apos;abonnement
          </h2>
          <p className="mb-4 text-[13px] text-gray-500">
            La résiliation prend effet immédiatement dans votre compte. Aucun renouvellement
            automatique n&apos;existe encore sur cette plateforme — l&apos;accès n&apos;est pas
            techniquement coupé à une date précise.
          </p>
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-100"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden />
            Résilier mon abonnement
          </button>
        </section>
      )}

      <PasswordConfirmModal
        open={confirmCancel}
        title="Résilier l'abonnement ?"
        description="Vous repasserez sur le suivi du plan Gratuit. Cette action est immédiate."
        confirmLabel="Résilier"
        destructive
        requirePassword={false}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={confirmCancelSubscription}
      />
    </>
  );
}
