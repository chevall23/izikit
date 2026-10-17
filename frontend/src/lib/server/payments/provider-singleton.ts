// Lazy-initialized default payment provider + module-level CircuitBreaker
// (D-PAY-02 + Pitfall 7).
//
// Which provider?
//   `PAYMENT_PROVIDER=saspay|moneroo` picks explicitly. When unset, SasPay wins
//   as soon as `SASPAY_SECRET_KEY` is present, otherwise Moneroo (the historical
//   default) so existing deployments keep working untouched.
//
// Why lazy?
//   `createSaspayProvider({...})` / `createMonerooProvider({...})` throw
//   synchronously when their env is missing. Calling them at module top-level
//   inside a route would crash the route-module on import — every
//   POST /api/orders would then return 500 with no useful error.
//
//   This module instead exposes `getProvider()` which constructs the provider
//   on first call, caches it for subsequent calls, and throws a typed
//   `PaymentProviderUnconfiguredError` if env is missing. The route catches
//   that error and returns a clean 503 PAYMENT_PROVIDER_UNCONFIGURED.
//
// Payouts:
//   Moneroo has no payout API. SasPay does (`payout()` on its handle), but the
//   withdrawals route currently only records the PENDING request — disbursement
//   is an admin action, not wired through this singleton.
//
// Why a single shared CircuitBreaker?
//   The breaker holds in-memory failure-counter state. Re-instantiating it
//   per request would defeat its purpose. Sharing it at module scope is by
//   design — see CLAUDE.md "single-instance only" note for the in-memory
//   breaker. For multi-pod deployments swap for a Redis-backed variant.
import 'server-only';
import { createMonerooProvider } from '@/lib/server/payments/moneroo';
import { createSaspayProvider, SASPAY_DEFAULT_API_URL } from '@/lib/server/payments/saspay';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';
import type { PaymentProvider } from '@/lib/server/payments/provider';

/**
 * Thrown by `getProvider()` when the selected provider's env is missing/empty.
 * The orders route should catch this `instanceof` and return 503
 * PAYMENT_PROVIDER_UNCONFIGURED.
 */
export class PaymentProviderUnconfiguredError extends Error {
  constructor(provider: 'saspay' | 'moneroo' = 'moneroo') {
    super(
      provider === 'saspay'
        ? 'Payment provider not configured (SASPAY_SECRET_KEY/_WEBHOOK_SECRET missing or empty)'
        : 'Payment provider not configured (MONEROO_API_URL/_SECRET_KEY/_WEBHOOK_SECRET missing or empty)',
    );
    this.name = 'PaymentProviderUnconfiguredError';
  }
}

let _provider: PaymentProvider | null = null;

/** Explicit `PAYMENT_PROVIDER`, else SasPay when its key is set, else Moneroo. */
function selectedProvider(): 'saspay' | 'moneroo' {
  const explicit = (process.env.PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'saspay' || explicit === 'moneroo') return explicit;
  return process.env.SASPAY_SECRET_KEY ? 'saspay' : 'moneroo';
}

/**
 * Lazy-init singleton accessor. First call reads `process.env`, constructs
 * the provider, and caches the handle. Subsequent calls reuse the cached
 * instance. Throws `PaymentProviderUnconfiguredError` if any required env var
 * is missing — the route translates that to 503.
 */
export function getProvider(): PaymentProvider {
  if (_provider) return _provider;

  const which = selectedProvider();

  if (which === 'saspay') {
    const key = process.env.SASPAY_SECRET_KEY ?? '';
    const webhookSecret = process.env.SASPAY_WEBHOOK_SECRET ?? '';
    if (!key || !webhookSecret) throw new PaymentProviderUnconfiguredError('saspay');
    _provider = createSaspayProvider({
      SASPAY_API_URL: process.env.SASPAY_API_URL || SASPAY_DEFAULT_API_URL,
      SASPAY_SECRET_KEY: key,
      SASPAY_WEBHOOK_SECRET: webhookSecret,
    });
    return _provider;
  }

  const url = process.env.MONEROO_API_URL ?? '';
  const key = process.env.MONEROO_SECRET_KEY ?? '';
  const webhookSecret = process.env.MONEROO_WEBHOOK_SECRET ?? '';

  if (!url || !key || !webhookSecret) {
    throw new PaymentProviderUnconfiguredError('moneroo');
  }

  _provider = createMonerooProvider({
    MONEROO_API_URL: url,
    MONEROO_SECRET_KEY: key,
    MONEROO_WEBHOOK_SECRET: webhookSecret,
  });
  return _provider;
}

/**
 * Module-level CircuitBreaker — single-instance only per CLAUDE.md.
 * D-PAY-02 hard-codes the thresholds:
 *   - failureThreshold = 5 failures within
 *   - windowMs = 30 000 (30s rolling window)
 *   - cooldownMs = 60 000 (open → half-open delay)
 */
export const breaker = new CircuitBreaker({
  name: 'payments.charge',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/**
 * Test-only escape hatch — clears the cached provider so a test can mutate
 * `process.env.*` and re-trigger lazy init. Never call this from
 * application code.
 *
 * @internal
 */
export function __resetProviderSingleton(): void {
  _provider = null;
}
