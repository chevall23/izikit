import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  createSaspayProvider,
  feeChargeMode,
  paymentMethodFromNetwork,
  resolvePayoutRoute,
  toDecimalAmount,
  SaspayApiError,
  type SaspayProviderHandle,
} from './saspay';

const SECRET = 'whsec_test';

function make(): SaspayProviderHandle {
  return createSaspayProvider({
    SASPAY_API_URL: 'https://api.saspay.me/api/v1/',
    SASPAY_SECRET_KEY: 'sk_test_abc',
    SASPAY_WEBHOOK_SECRET: SECRET,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sign(body: string, ts: number, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('toDecimalAmount', () => {
  it('formats integers as 2-decimal strings', () => {
    expect(toDecimalAmount(2500)).toBe('2500.00');
  });
  it('rejects non-integers and non-positive amounts', () => {
    expect(() => toDecimalAmount(10.5)).toThrow();
    expect(() => toDecimalAmount(0)).toThrow();
  });
});

describe('createSaspayProvider — env validation', () => {
  it('throws when a required value is missing', () => {
    expect(() =>
      createSaspayProvider({
        SASPAY_API_URL: '',
        SASPAY_SECRET_KEY: 'k',
        SASPAY_WEBHOOK_SECRET: 's',
      }),
    ).toThrow(/SASPAY_API_URL/);
    expect(() =>
      createSaspayProvider({
        SASPAY_API_URL: 'u',
        SASPAY_SECRET_KEY: '',
        SASPAY_WEBHOOK_SECRET: 's',
      }),
    ).toThrow(/SASPAY_SECRET_KEY/);
    expect(() =>
      createSaspayProvider({
        SASPAY_API_URL: 'u',
        SASPAY_SECRET_KEY: 'k',
        SASPAY_WEBHOOK_SECRET: '',
      }),
    ).toThrow(/SASPAY_WEBHOOK_SECRET/);
  });
});

describe('feeChargeMode', () => {
  const env = (v?: string) => ({ SASPAY_FEE_CHARGE_MODE: v }) as unknown as NodeJS.ProcessEnv;
  it('defaults to DEDUCTED (the platform bears the fees)', () => {
    expect(feeChargeMode(env())).toBe('DEDUCTED');
    expect(feeChargeMode(env('garbage'))).toBe('DEDUCTED');
  });
  it('can be switched to ADD_ON or left to the merchant account setting', () => {
    expect(feeChargeMode(env('add_on'))).toBe('ADD_ON');
    expect(feeChargeMode(env('default'))).toBeNull();
  });
});

describe('charge', () => {
  it('asks SasPay to deduct the fees from the merchant, not the customer', async () => {
    fetchMock.mockResolvedValue(
      json({ data: { id: 's', checkout_url: 'https://pay.saspay.me/c', status: 'PENDING' } }, 201),
    );
    await make().charge({
      amount: 5000,
      currency: 'XOF',
      customer: { email: 'awa@example.com' },
      successUrl: 'https://app.test/ok',
      failureUrl: 'https://app.test/ko',
      externalRef: 'o',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).fee_charge_mode).toBe('DEDUCTED');
  });

  it('creates a checkout session with a decimal amount and the order id', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          success: true,
          code: 201,
          data: {
            id: 'sess_1',
            checkout_url: 'https://pay.saspay.me/checkout/abc',
            status: 'PENDING',
          },
        },
        201,
      ),
    );
    const result = await make().charge({
      amount: 5000,
      currency: 'XOF',
      customer: { email: 'awa@example.com', name: 'Awa Sossou', phone: '+22997505050' },
      successUrl: 'https://app.test/orders/o1/success',
      failureUrl: 'https://app.test/orders/o1/failed',
      externalRef: 'order_1',
    });

    expect(result).toEqual({
      providerChargeId: 'sess_1',
      paymentUrl: 'https://pay.saspay.me/checkout/abc',
      status: 'PENDING',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.saspay.me/api/v1/checkout-sessions/');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_abc');
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: '5000.00',
      currency: 'XOF',
      customer_email: 'awa@example.com',
      customer_name: 'Awa Sossou',
      customer_phone: '+22997505050',
      return_url: 'https://app.test/orders/o1/success',
      metadata: { orderId: 'order_1' },
    });
  });

  it('falls back to the e-mail local part when no name is given', async () => {
    fetchMock.mockResolvedValue(json({ data: { id: 's', checkout_url: 'https://x' } }, 201));
    await make().charge({
      amount: 1000,
      currency: 'XOF',
      customer: { email: 'kofi@example.com' },
      successUrl: 'https://a',
      failureUrl: 'https://b',
      externalRef: 'o',
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.customer_name).toBe('kofi');
  });

  it('requires a customer e-mail', async () => {
    await expect(
      make().charge({
        amount: 1000,
        currency: 'XOF',
        customer: {},
        successUrl: 'https://a',
        failureUrl: 'https://b',
        externalRef: 'o',
      }),
    ).rejects.toThrow(/email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces SasPay business errors with their stable code', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          success: false,
          code: 403,
          error: { message: 'Compte suspendu', code: 'merchant_suspended' },
        },
        403,
      ),
    );
    const err = await make()
      .charge({
        amount: 1000,
        currency: 'XOF',
        customer: { email: 'a@b.co' },
        successUrl: 'https://a',
        failureUrl: 'https://b',
        externalRef: 'o',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaspayApiError);
    expect((err as SaspayApiError).status).toBe(403);
    expect((err as SaspayApiError).code).toBe('merchant_suspended');
  });

  it('throws when the response has no checkout_url', async () => {
    fetchMock.mockResolvedValue(json({ data: { id: 's' } }, 201));
    await expect(
      make().charge({
        amount: 1000,
        currency: 'XOF',
        customer: { email: 'a@b.co' },
        successUrl: 'https://a',
        failureUrl: 'https://b',
        externalRef: 'o',
      }),
    ).rejects.toThrow(/checkout_url/);
  });
});

describe('payout', () => {
  it('resolves country, network and msisdn from the phone and method', () => {
    expect(resolvePayoutRoute({ method: 'WAVE', phone: '+221771234567' })).toEqual({
      country: 'SN',
      currency: 'XOF',
      method: 'wave_sn',
      msisdn: '221771234567',
    });
    expect(resolvePayoutRoute({ method: 'MTN_MOMO', phone: '+22997505050' }).method).toBe('mtn_bj');
    expect(resolvePayoutRoute({ method: 'ORANGE_MONEY', phone: '+2250707070707' }).method).toBe(
      'orange_ci',
    );
    // An already-valid SasPay code is passed through.
    expect(resolvePayoutRoute({ method: 'togocel', phone: '+22890000000' }).method).toBe('togocel');
  });

  it('rejects an unknown country or method', () => {
    expect(() => resolvePayoutRoute({ method: 'WAVE', phone: '+33612345678' })).toThrow(
      /unsupported phone/,
    );
    expect(() => resolvePayoutRoute({ method: 'Bad Method!', phone: '+221771234567' })).toThrow(
      /unknown method/,
    );
  });

  it('sends an idempotency key derived from the withdrawal id', async () => {
    fetchMock.mockResolvedValue(
      json({ success: true, data: { message: 'ok', id: 'po_1' }, code: 201 }, 201),
    );
    const result = await make().payout!({
      amount: 10000,
      currency: 'XOF',
      destination: { method: 'WAVE', phone: '+221771234567', accountName: 'Awa Sossou' },
      externalRef: 'wd_1',
    });
    expect(result).toEqual({ providerPayoutId: 'po_1', status: 'PENDING' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.saspay.me/api/v1/payouts/initialize/');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('payout:wd_1');
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: '10000.00',
      currency: 'XOF',
      country: 'SN',
      method: 'wave_sn',
      recipient: { msisdn: '221771234567' },
    });
  });

  it('refuses a currency that does not match the beneficiary country', async () => {
    await expect(
      make().payout!({
        amount: 100,
        currency: 'USD',
        destination: { method: 'WAVE', phone: '+221771234567' },
        externalRef: 'wd',
      }),
    ).rejects.toThrow(/does not match/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('refund', () => {
  it('is not supported', async () => {
    await expect(make().refund!({ providerChargeId: 'x' })).rejects.toThrow(/not supported/);
  });
});

describe('read-side helpers', () => {
  it('verifyPayment maps the status and parses the requested amount', async () => {
    fetchMock.mockResolvedValue(
      json({ data: { id: 't1', status: 'SUCCESS', requested_amount: '2500.00', currency: 'XOF' } }),
    );
    const r = await make().verifyPayment('t1');
    expect(r).toEqual({ id: 't1', status: 'PAID', amount: 2500, currency: 'XOF' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://api.saspay.me/api/v1/payments/t1/verify/',
    );
  });

  it('getCheckoutStatus prefers the transaction status', async () => {
    fetchMock.mockResolvedValue(
      json({ data: { status: 'PAID', transaction_id: 'tx9', transaction_status: 'SUCCESS' } }),
    );
    expect(await make().getCheckoutStatus('s1')).toEqual({ status: 'PAID', transactionId: 'tx9' });
  });

  it('resolveCheckoutSessionId finds the session owning a transaction', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: {
          count: 2,
          results: [
            { id: 'sA', transaction: 'tx1' },
            { id: 'sB', transaction: 'tx2' },
          ],
        },
      }),
    );
    expect(await make().resolveCheckoutSessionId('tx2')).toBe('sB');
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/checkout-sessions/?status=PAID');
  });

  it('resolveCheckoutSessionId returns null when nothing matches', async () => {
    fetchMock.mockResolvedValue(json({ data: { results: [{ id: 'sA', transaction: 'tx1' }] } }));
    expect(await make().resolveCheckoutSessionId('nope')).toBeNull();
  });
});

describe('paymentMethodFromNetwork', () => {
  it('maps to the admin UI vocabulary', () => {
    expect(paymentMethodFromNetwork('wave_sn')).toBe('WAVE');
    expect(paymentMethodFromNetwork('orange_ci')).toBe('ORANGE_MONEY');
    expect(paymentMethodFromNetwork('freemoney_sn')).toBe('FREE_MONEY');
    expect(paymentMethodFromNetwork('mtn_bj')).toBe('MTN_BJ');
    expect(paymentMethodFromNetwork(undefined)).toBeNull();
  });
});

describe('webhookProvider.verifySignature', () => {
  const body = JSON.stringify({ event: 'transaction.success', data: { id: 'tx1' } });
  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a valid signature over `timestamp.body`', () => {
    const ts = now();
    const r = make().webhookProvider.verifySignature(Buffer.from(body), {
      'x-webhook-signature': sign(body, ts),
      'x-webhook-timestamp': String(ts),
    });
    expect(r.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = now();
    const r = make().webhookProvider.verifySignature(Buffer.from(body.replace('tx1', 'tx2')), {
      'x-webhook-signature': sign(body, ts),
      'x-webhook-timestamp': String(ts),
    });
    expect(r).toEqual({ valid: false, reason: 'HMAC mismatch' });
  });

  it('rejects a signature made with another secret', () => {
    const ts = now();
    const r = make().webhookProvider.verifySignature(Buffer.from(body), {
      'x-webhook-signature': sign(body, ts, 'other'),
      'x-webhook-timestamp': String(ts),
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a signature that ignores the timestamp (body-only HMAC)', () => {
    const ts = now();
    const bodyOnly = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const r = make().webhookProvider.verifySignature(Buffer.from(body), {
      'x-webhook-signature': bodyOnly,
      'x-webhook-timestamp': String(ts),
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a stale timestamp even when the signature is correct (replay)', () => {
    const ts = now() - 301;
    const r = make().webhookProvider.verifySignature(Buffer.from(body), {
      'x-webhook-signature': sign(body, ts),
      'x-webhook-timestamp': String(ts),
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/tolerance/);
  });

  it('rejects a timestamp too far in the future', () => {
    const ts = now() + 400;
    const r = make().webhookProvider.verifySignature(Buffer.from(body), {
      'x-webhook-signature': sign(body, ts),
      'x-webhook-timestamp': String(ts),
    });
    expect(r.valid).toBe(false);
  });

  it('rejects missing headers and a non-numeric timestamp', () => {
    const wp = make().webhookProvider;
    expect(wp.verifySignature(Buffer.from(body), {}).reason).toMatch(/x-webhook-signature/);
    expect(wp.verifySignature(Buffer.from(body), { 'x-webhook-signature': 'ab' }).reason).toMatch(
      /x-webhook-timestamp/,
    );
    expect(
      wp.verifySignature(Buffer.from(body), {
        'x-webhook-signature': 'ab',
        'x-webhook-timestamp': 'soon',
      }).reason,
    ).toMatch(/invalid timestamp/);
  });

  it('honours the dev bypass outside production only', () => {
    vi.stubEnv('SMOKE_BYPASS_WEBHOOK_VERIFY', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(make().webhookProvider.verifySignature(Buffer.from(body), {}).valid).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(make().webhookProvider.verifySignature(Buffer.from(body), {}).valid).toBe(false);
  });
});

describe('webhookProvider.extractIds', () => {
  const wp = make().webhookProvider;
  it('maps transaction.success to paid', () => {
    expect(wp.extractIds({ event: 'transaction.success', data: { id: 'tx1' } })).toEqual({
      externalId: 'tx1',
      eventType: 'transaction.success',
      kind: 'paid',
    });
  });
  it('maps failed and cancelled to failed', () => {
    expect(wp.extractIds({ event: 'transaction.failed', data: { id: 'tx1' } }).kind).toBe('failed');
    expect(wp.extractIds({ event: 'transaction.cancelled', data: { id: 'tx1' } }).kind).toBe(
      'failed',
    );
  });
  it('treats every other event as other', () => {
    for (const event of ['transaction.created', 'settlement.success', 'webhook.test']) {
      expect(wp.extractIds({ event, data: { id: 'x' } }).kind).toBe('other');
    }
  });
});
