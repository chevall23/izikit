// frontend/src/lib/server/webhook/saspay.ts
//
// Re-exports the WebhookProvider impl from the payments adapter so the
// webhook namespace is cohesive (handler factory + per-provider impls).
// Mirrors webhook/moneroo.ts's lazy-init wrapper pattern (supports
// vi.stubEnv in tests — env is read on first call, not at module load).
import 'server-only';
import type { WebhookProvider } from './handler';
import {
  createSaspayProvider,
  SASPAY_DEFAULT_API_URL,
  type SaspayProviderHandle,
  type SaspayWebhookPayload,
} from '../payments/saspay';

export type { SaspayWebhookPayload };

let _handle: SaspayProviderHandle | null = null;

/**
 * Lazy-init — env reads happen at first call so `vi.stubEnv` works in tests.
 * The full handle (not just the webhook half) is exposed because the webhook
 * route needs `resolveCheckoutSessionId` to correlate transactions to orders.
 */
export function getSaspayHandle(): SaspayProviderHandle {
  if (_handle) return _handle;
  const env = {
    SASPAY_API_URL: process.env.SASPAY_API_URL || SASPAY_DEFAULT_API_URL,
    SASPAY_SECRET_KEY: process.env.SASPAY_SECRET_KEY ?? '',
    SASPAY_WEBHOOK_SECRET: process.env.SASPAY_WEBHOOK_SECRET ?? '',
  };
  if (!env.SASPAY_SECRET_KEY || !env.SASPAY_WEBHOOK_SECRET) {
    throw new Error('SasPay webhook provider not configured (env missing)');
  }
  _handle = createSaspayProvider(env);
  return _handle;
}

export function getSaspayWebhookProvider(): WebhookProvider<SaspayWebhookPayload> {
  return getSaspayHandle().webhookProvider;
}

/** Convenience binding for the route file. */
export const saspayWebhookProvider: WebhookProvider<SaspayWebhookPayload> = {
  name: 'saspay',
  verifySignature: (raw, headers) => getSaspayWebhookProvider().verifySignature(raw, headers),
  parsePayload: (raw) => getSaspayWebhookProvider().parsePayload(raw),
  extractIds: (payload) => getSaspayWebhookProvider().extractIds(payload),
};

/** Test-only — clear the cached provider for `vi.stubEnv` reuse. */
export function __resetSaspayWebhookProvider(): void {
  _handle = null;
}
