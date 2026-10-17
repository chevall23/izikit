/**
 * SasPay provider — mobile money + card aggregator for West/Central Africa
 * (https://docs.saspay.me). One API for charges (hosted checkout) and
 * payouts (mobile money disbursement).
 *
 * Auth: `Authorization: Bearer sk_test_… | sk_live_…` — the key prefix decides
 * sandbox vs live, the base URL is the same. Server-side only.
 *
 * Amounts: the API speaks decimal strings ("2500.00"); this app speaks integers
 * in the smallest currency unit (XOF = no decimals). The adapter converts at
 * the boundary, in both directions.
 *
 * Charge flow: `POST /checkout-sessions/` → redirect the customer to
 * `checkout_url`. The session id becomes `Order.providerChargeId`. SasPay's
 * webhook reports the *transaction* id (a different id), so webhook handlers
 * correlate through `metadata.orderId` when echoed, `providerChargeId`, or
 * `resolveCheckoutSessionId()` (lists PAID sessions and matches `transaction`).
 * `return_url` is only honoured by SasPay on a successful payment.
 *
 * Payout flow: `POST /payouts/initialize/` with an `Idempotency-Key`. Requires
 * the server IP to be whitelisted on the merchant (403 ip_not_whitelisted).
 *
 * Webhook signature: `X-Webhook-Signature` = hex HMAC-SHA256 of
 * `{X-Webhook-Timestamp}.{raw body}` keyed by the webhook `signing_secret`;
 * timestamps more than 5 minutes off are rejected (anti-replay).
 *
 * Dev escape hatch: when `process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1'`
 * (never in production), `verifySignature` accepts everything — same flag as
 * the Moneroo / Bictorys providers.
 */
import crypto from 'node:crypto';
import { createLogger } from '../logger';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';
import type {
  PaymentProvider,
  ChargeInput,
  ChargeResult,
  ChargeStatus,
  PayoutInput,
  PayoutResult,
  RefundInput,
  RefundResult,
} from './provider';

const logger = createLogger();

// ───────────────────────────────────────────────────────────────────────
// Env shape
// ───────────────────────────────────────────────────────────────────────

export interface SaspayEnv {
  /** Secret API key (`sk_test_…` / `sk_live_…`). Required. */
  SASPAY_SECRET_KEY: string;
  /** Base URL, normally "https://api.saspay.me/api/v1". Required. */
  SASPAY_API_URL: string;
  /** `signing_secret` of the dashboard webhook (shown once at creation). */
  SASPAY_WEBHOOK_SECRET: string;
}

export const SASPAY_DEFAULT_API_URL = 'https://api.saspay.me/api/v1';

// ───────────────────────────────────────────────────────────────────────
// Webhook payload
// ───────────────────────────────────────────────────────────────────────

export interface SaspayWebhookPayload {
  /** e.g. "transaction.success" | "transaction.failed" | "transaction.cancelled". */
  event?: string;
  data?: {
    /** Transaction id (NOT the checkout session id). */
    id?: string;
    reference?: string;
    /** "PAIEMENT" / "PAYIN" for charges, "RETRAIT" / "PAYOUT" for payouts. */
    type?: string;
    status?: string;
    /** Requested amount as a decimal string — what the order was priced at. */
    amount?: string | number;
    fee?: string | number;
    charged?: string | number;
    net_amount?: string | number;
    fee_charge_mode?: string;
    currency?: string;
    country?: string;
    network?: string;
    msisdn?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ───────────────────────────────────────────────────────────────────────
// Errors
// ───────────────────────────────────────────────────────────────────────

/** Non-2xx answer from SasPay. `code` is the stable business code, if any. */
export class SaspayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SaspayApiError';
  }
}

// ───────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────

const HTTP_TIMEOUT_MS = 30_000;
const DESCRIPTION_MAX_LEN = 200;
/** Max age of a webhook timestamp, per the SasPay docs. */
const WEBHOOK_TOLERANCE_SECONDS = 300;
/** Cap on the PAID-session scan used to map a transaction id to its session. */
const SESSION_SCAN_PAGES = 3;
const SESSION_SCAN_PAGE_SIZE = 100;

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Whole smallest-unit integer → SasPay decimal string ("2500" → "2500.00"). */
export function toDecimalAmount(amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`SasPay amount must be a positive integer, got ${amount}`);
  }
  return `${amount}.00`;
}

/** SasPay status → app status. `CANCELLED` is treated as a failure. */
export function classifySaspayStatus(raw: string | undefined): ChargeStatus {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'SUCCESS' || s === 'PAID' || s === 'COMPLETED') return 'PAID';
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED') return 'FAILED';
  return 'PENDING';
}

/** SasPay requires customer_name — fall back to the e-mail local part. */
function displayName(name: string | undefined, email: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (trimmed) return trimmed;
  return (email ?? '').split('@')[0] || 'Client';
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.split(/\s+/);
  const firstName = parts[0] ?? 'Client';
  return { firstName, lastName: parts.length > 1 ? parts.slice(1).join(' ') : '-' };
}

/** Responses are wrapped in `{ success, data, code }`; tolerate unwrapped bodies too. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    const data = (body as { data?: unknown }).data;
    if (data !== undefined && data !== null) return data as T;
  }
  return body as T;
}

function extractError(body: unknown): { message: string; code?: string } {
  const err = (body as { error?: unknown } | null)?.error;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === 'string') {
      return { message: e.message, ...(typeof e.code === 'string' ? { code: e.code } : {}) };
    }
    // Validation error shape: { field: ["msg"], … }
    return { message: JSON.stringify(err).slice(0, 200) };
  }
  return { message: 'unknown error' };
}

// Dial code → country, from the SasPay catalogue (docs "Pays, réseaux et format
// du téléphone"). Used to derive `country` + network code for payouts.
const COUNTRY_BY_DIAL: Record<string, { iso: string; currency: string }> = {
  '226': { iso: 'BF', currency: 'XOF' },
  '229': { iso: 'BJ', currency: 'XOF' },
  '243': { iso: 'CD', currency: 'CDF' },
  '225': { iso: 'CI', currency: 'XOF' },
  '237': { iso: 'CM', currency: 'XAF' },
  '233': { iso: 'GH', currency: 'GHS' },
  '224': { iso: 'GN', currency: 'GNF' },
  '254': { iso: 'KE', currency: 'KES' },
  '223': { iso: 'ML', currency: 'XOF' },
  '265': { iso: 'MW', currency: 'MWK' },
  '227': { iso: 'NE', currency: 'XOF' },
  '234': { iso: 'NG', currency: 'NGN' },
  '250': { iso: 'RW', currency: 'RWF' },
  '221': { iso: 'SN', currency: 'XOF' },
  '228': { iso: 'TG', currency: 'XOF' },
  '255': { iso: 'TZ', currency: 'TZS' },
  '256': { iso: 'UG', currency: 'UGX' },
  '260': { iso: 'ZM', currency: 'ZMW' },
};

/** App-level method names → SasPay network code prefix (`<prefix>_<iso2>`). */
const METHOD_PREFIX: Record<string, string> = {
  WAVE: 'wave',
  ORANGE_MONEY: 'orange',
  MTN_MOMO: 'mtn',
  MOOV_MONEY: 'moov',
  AIRTEL_MONEY: 'airtel',
};

/**
 * SasPay network code → the `Order.paymentMethod` vocabulary used by the admin
 * UI ("wave_sn" → "WAVE", "orange_ci" → "ORANGE_MONEY"). Unknown codes are
 * upper-cased as is ("mtn_bj" → "MTN_BJ"); `null` when absent.
 */
export function paymentMethodFromNetwork(network: string | undefined): string | null {
  if (!network) return null;
  const code = network.toLowerCase();
  if (code.startsWith('wave_')) return 'WAVE';
  if (code.startsWith('orange_')) return 'ORANGE_MONEY';
  if (code.startsWith('freemoney_')) return 'FREE_MONEY';
  return code.toUpperCase();
}

/** Resolves `{ country, currency, method, msisdn }` for a payout destination. */
export function resolvePayoutRoute(destination: { method: string; phone: string }): {
  country: string;
  currency: string;
  method: string;
  msisdn: string;
} {
  const digits = destination.phone.replace(/[^\d]/g, '');
  const dial = COUNTRY_BY_DIAL[digits.slice(0, 3)];
  if (!dial) {
    throw new Error(`SasPay payout: unsupported phone country code in ${destination.phone}`);
  }
  const key = destination.method.toUpperCase();
  let method: string;
  if (key === 'FREE_MONEY') method = 'freemoney_sn';
  else if (METHOD_PREFIX[key]) method = `${METHOD_PREFIX[key]}_${dial.iso.toLowerCase()}`;
  // Already a SasPay network code (e.g. "mtn_bj", "togocel").
  else if (/^[a-z0-9]+(_[a-z]{2})?$/.test(destination.method)) method = destination.method;
  else throw new Error(`SasPay payout: unknown method ${destination.method}`);
  return { country: dial.iso, currency: dial.currency, method, msisdn: digits };
}

// ───────────────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────────────

export interface SaspayVerifyResult {
  id: string;
  status: ChargeStatus;
  /** Requested amount, integer smallest unit (undefined when not reported). */
  amount?: number | undefined;
  currency?: string | undefined;
}

export interface SaspayProviderHandle extends PaymentProvider {
  webhookProvider: WebhookProvider<SaspayWebhookPayload>;
  /** Authoritative status of a transaction (`GET /payments/{id}/verify/`). */
  verifyPayment(transactionId: string): Promise<SaspayVerifyResult>;
  /** Authoritative status of a payout (`GET /payouts/{id}/verify/`). */
  verifyPayout(payoutId: string): Promise<SaspayVerifyResult>;
  /** State of a checkout session and of its transaction, if paid. */
  getCheckoutStatus(
    sessionId: string,
  ): Promise<{ status: ChargeStatus; transactionId: string | null }>;
  /**
   * Maps a webhook transaction id back to the checkout session id stored in
   * `Order.providerChargeId`, by scanning recently PAID sessions. `null` when
   * the transaction does not come from one of our checkout sessions.
   */
  resolveCheckoutSessionId(transactionId: string): Promise<string | null>;
}

function parseAmount(raw: unknown): number | undefined {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export function createSaspayProvider(env: SaspayEnv): SaspayProviderHandle {
  if (!env.SASPAY_API_URL) throw new Error('createSaspayProvider: SASPAY_API_URL is required');
  if (!env.SASPAY_SECRET_KEY)
    throw new Error('createSaspayProvider: SASPAY_SECRET_KEY is required');
  if (!env.SASPAY_WEBHOOK_SECRET)
    throw new Error('createSaspayProvider: SASPAY_WEBHOOK_SECRET is required');

  const baseUrl = env.SASPAY_API_URL.replace(/\/+$/, '');

  async function request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${env.SASPAY_SECRET_KEY}`,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SasPay network error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      throw new SaspayApiError(
        `SasPay returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`,
        res.status,
      );
    }
    if (!res.ok) {
      const { message, code } = extractError(parsed);
      throw new SaspayApiError(`SasPay HTTP ${res.status} — ${message}`, res.status, code);
    }
    return unwrap<T>(parsed);
  }

  // ── charge (hosted checkout) ───────────────────────────────────────
  async function charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.customer.email) {
      throw new Error('SasPay charge requires customer.email');
    }
    const description =
      typeof input.metadata?.description === 'string'
        ? (input.metadata.description as string)
        : 'Paiement HabitatAfrik';

    const data = await request<{ id?: string; checkout_url?: string; status?: string }>(
      '/checkout-sessions/',
      {
        method: 'POST',
        body: {
          amount: toDecimalAmount(input.amount),
          currency: input.currency,
          description: description.slice(0, DESCRIPTION_MAX_LEN),
          customer_email: input.customer.email,
          customer_name: displayName(input.customer.name, input.customer.email),
          ...(input.customer.phone ? { customer_phone: input.customer.phone } : {}),
          // SasPay only redirects on success; failures stay on its page with a
          // "retry" button, so `failureUrl` has no equivalent.
          return_url: input.successUrl,
          metadata: { orderId: input.externalRef },
        },
      },
    );

    const providerChargeId = data?.id ?? '';
    const paymentUrl = data?.checkout_url ?? '';
    if (!providerChargeId || !paymentUrl) {
      throw new Error('SasPay returned no session id or checkout_url');
    }
    // A fresh session is always PENDING, whatever its vocabulary ("PAID" only
    // after the customer pays).
    return { providerChargeId, paymentUrl, status: 'PENDING' };
  }

  // ── payout (mobile money disbursement) ─────────────────────────────
  async function payout(input: PayoutInput): Promise<PayoutResult> {
    const route = resolvePayoutRoute(input.destination);
    if (route.currency !== input.currency.toUpperCase()) {
      // SasPay refuses (currency_country_mismatch) rather than converting.
      throw new Error(
        `SasPay payout: ${input.currency} does not match ${route.country} (${route.currency})`,
      );
    }
    const { firstName, lastName } = splitName(
      displayName(input.destination.accountName, undefined),
    );

    const data = await request<{ id?: string }>('/payouts/initialize/', {
      method: 'POST',
      // The withdrawal id doubles as the idempotency key: a network retry
      // returns the first response instead of paying the beneficiary twice.
      idempotencyKey: `payout:${input.externalRef}`,
      body: {
        amount: toDecimalAmount(input.amount),
        currency: route.currency,
        country: route.country,
        description: 'Retrait HabitatAfrik',
        customer: { phone: `+${route.msisdn}`, first_name: firstName, last_name: lastName },
        method: route.method,
        recipient: { msisdn: route.msisdn },
        metadata: { withdrawalId: input.externalRef },
      },
    });

    if (!data?.id) throw new Error('SasPay returned no payout id');
    // Initialisation only queues the payout; the final state arrives by webhook
    // or `verifyPayout`.
    return { providerPayoutId: data.id, status: 'PENDING' };
  }

  // ── refund — no public refund endpoint in the SasPay API ───────────
  async function refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error('Refund not supported by SasPay API — refund manually from the dashboard');
  }

  // ── read-side helpers ──────────────────────────────────────────────
  async function verify(path: string): Promise<SaspayVerifyResult> {
    const d = await request<{
      id?: string;
      status?: string;
      requested_amount?: string;
      currency?: string;
    }>(path, { method: 'GET' });
    return {
      id: d?.id ?? '',
      status: classifySaspayStatus(d?.status),
      amount: parseAmount(d?.requested_amount),
      currency: d?.currency,
    };
  }

  async function getCheckoutStatus(sessionId: string) {
    const d = await request<{
      status?: string;
      transaction_id?: string | null;
      transaction_status?: string | null;
    }>(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`, { method: 'GET' });
    // Session vocabulary is PENDING | PAID | EXPIRED | CANCELLED; the
    // transaction status, when present, is the more precise signal.
    const status = classifySaspayStatus(d?.transaction_status ?? d?.status);
    return { status, transactionId: d?.transaction_id ?? null };
  }

  async function resolveCheckoutSessionId(transactionId: string): Promise<string | null> {
    for (let page = 1; page <= SESSION_SCAN_PAGES; page++) {
      const d = await request<
        { results?: Array<{ id?: string; transaction?: string | null }> } | undefined
      >(`/checkout-sessions/?status=PAID&page=${page}&page_size=${SESSION_SCAN_PAGE_SIZE}`, {
        method: 'GET',
      });
      const results = Array.isArray(d) ? d : (d?.results ?? []);
      const hit = results.find((s) => s.transaction === transactionId);
      if (hit?.id) return hit.id;
      if (results.length < SESSION_SCAN_PAGE_SIZE) break;
    }
    return null;
  }

  // ── webhook provider ──────────────────────────────────────────────
  const webhookProvider: WebhookProvider<SaspayWebhookPayload> = {
    name: 'saspay',

    verifySignature(rawBody, headers) {
      // Hard-disabled in production: a stray env line must never turn off
      // signature checks on real-money webhooks.
      if (
        process.env.SMOKE_BYPASS_WEBHOOK_VERIFY === '1' &&
        process.env.NODE_ENV !== 'production'
      ) {
        logger.warn(
          '[saspay] !! SMOKE_BYPASS_WEBHOOK_VERIFY=1 — webhook signature ACCEPTED unconditionally. NEVER set this in production.',
        );
        return { valid: true };
      }

      const sig = headers['x-webhook-signature'];
      if (!sig) return { valid: false, reason: 'no x-webhook-signature header' };
      const timestamp = headers['x-webhook-timestamp'];
      if (!timestamp) return { valid: false, reason: 'no x-webhook-timestamp header' };

      const ts = Number(timestamp);
      if (!Number.isFinite(ts)) return { valid: false, reason: 'invalid timestamp' };
      const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
      if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
        return { valid: false, reason: `timestamp outside tolerance (${ageSeconds}s)` };
      }

      // Signed message is `{timestamp}.{raw body}` — raw bytes, never a
      // re-serialisation of the parsed JSON.
      const expected = crypto
        .createHmac('sha256', env.SASPAY_WEBHOOK_SECRET)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest('hex');
      if (timingSafeStringEqual(sig.trim().toLowerCase(), expected)) {
        return { valid: true };
      }
      return { valid: false, reason: 'HMAC mismatch' };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as SaspayWebhookPayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(payload.data?.id ?? '');
      const eventType = String(payload.event ?? 'unknown');
      let kind: ParsedIds['kind'] = 'other';
      if (eventType === 'transaction.success') kind = 'paid';
      else if (eventType === 'transaction.failed' || eventType === 'transaction.cancelled') {
        kind = 'failed';
      }
      return { externalId, eventType, kind };
    },
  };

  return {
    name: 'saspay',
    charge,
    payout,
    refund,
    webhookProvider,
    verifyPayment: (id) => verify(`/payments/${encodeURIComponent(id)}/verify/`),
    verifyPayout: (id) => verify(`/payouts/${encodeURIComponent(id)}/verify/`),
    getCheckoutStatus,
    resolveCheckoutSessionId,
  };
}
