import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const SECRET = 'whsec_test';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const orderFindFirst = vi.fn();
const withdrawalFindFirst = vi.fn();
const withdrawalUpdateMany = vi.fn();
const markOrderPaid = vi.fn();
const markOrderFailed = vi.fn();
const fetchMock = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
  fn({
    webhookLog: { findUnique, create, update },
    order: { findFirst: orderFindFirst },
    withdrawal: { findFirst: withdrawalFindFirst, updateMany: withdrawalUpdateMany },
  }),
);

vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));
vi.mock('@/lib/server/payments/order-transitions', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/server/payments/order-transitions')>()),
  markOrderPaid,
  markOrderFailed,
}));

function webhookRequest(
  event: string,
  data: Record<string, unknown>,
  opts: { tamper?: boolean; ageSeconds?: number } = {},
): NextRequest {
  const body = JSON.stringify({ event, data });
  const ts = Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0);
  const signature = crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  return new NextRequest('http://localhost/api/webhooks/saspay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': String(ts),
      'x-webhook-event': event,
    },
    body: opts.tamper ? body.replace('SUCCESS', 'FAILED') : body,
  });
}

const ORDER = { id: 'o1', amount: 25_000, currency: 'XOF' };
const PAID = {
  id: 'tx1',
  status: 'SUCCESS',
  amount: '25000.00',
  currency: 'XOF',
  network: 'wave_sn',
};

beforeEach(() => {
  vi.stubEnv('SASPAY_API_URL', 'https://api.saspay.test/api/v1');
  vi.stubEnv('SASPAY_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('SASPAY_WEBHOOK_SECRET', SECRET);
  vi.stubGlobal('fetch', fetchMock);
  for (const m of [
    findUnique,
    create,
    update,
    orderFindFirst,
    withdrawalFindFirst,
    withdrawalUpdateMany,
    markOrderPaid,
    markOrderFailed,
    fetchMock,
  ]) {
    m.mockReset();
  }
  findUnique.mockResolvedValue(null);
  orderFindFirst.mockResolvedValue(null);
  withdrawalFindFirst.mockResolvedValue(null);
  markOrderPaid.mockResolvedValue(true);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const { __resetSaspayWebhookProvider } = await import('@/lib/server/webhook/saspay');
  __resetSaspayWebhookProvider();
});

describe('POST /api/webhooks/saspay', () => {
  it('rejects a tampered body with 401', async () => {
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', PAID, { tamper: true }));
    expect(res.status).toBe(401);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('rejects a replayed (stale) delivery with 401', async () => {
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', PAID, { ageSeconds: 600 }));
    expect(res.status).toBe(401);
  });

  it('marks the order PAID when metadata.orderId is echoed', async () => {
    orderFindFirst.mockResolvedValueOnce(ORDER);
    const { POST } = await import('./route');
    const res = await POST(
      webhookRequest('transaction.success', { ...PAID, metadata: { orderId: 'o1' } }),
    );
    expect(res.status).toBe(200);
    expect(orderFindFirst).toHaveBeenCalledWith({ where: { id: 'o1', provider: 'saspay' } });
    expect(markOrderPaid).toHaveBeenCalledWith(expect.anything(), ORDER, {
      paidAmount: 25_000,
      paymentMethod: 'WAVE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('matches the order on providerChargeId when ids coincide', async () => {
    orderFindFirst.mockResolvedValueOnce(ORDER);
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', PAID));
    expect(res.status).toBe(200);
    expect(orderFindFirst).toHaveBeenCalledWith({ where: { providerChargeId: 'tx1' } });
    expect(markOrderPaid).toHaveBeenCalledTimes(1);
  });

  it('resolves the checkout session when only the transaction id is known', async () => {
    orderFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(ORDER);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { results: [{ id: 'sess9', transaction: 'tx1' }] } }), {
        status: 200,
      }),
    );
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', PAID));
    expect(res.status).toBe(200);
    expect(orderFindFirst).toHaveBeenLastCalledWith({ where: { providerChargeId: 'sess9' } });
    expect(markOrderPaid).toHaveBeenCalledWith(expect.anything(), ORDER, expect.any(Object));
  });

  it('skips the amount check when the settlement currency differs (card in USD)', async () => {
    orderFindFirst.mockResolvedValueOnce(ORDER);
    const { POST } = await import('./route');
    await POST(
      webhookRequest('transaction.success', { ...PAID, currency: 'USD', amount: '41.00' }),
    );
    expect(markOrderPaid).toHaveBeenCalledWith(expect.anything(), ORDER, {
      paidAmount: undefined,
      paymentMethod: 'WAVE',
    });
  });

  it('completes a pending withdrawal on payout success', async () => {
    withdrawalFindFirst.mockResolvedValueOnce({ id: 'w1' });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { results: [] } })));
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', { ...PAID, type: 'RETRAIT' }));
    expect(res.status).toBe(200);
    expect(withdrawalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'w1', status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('returns 500 (so SasPay retries) when a successful payment matches nothing', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { results: [] } })));
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.success', PAID));
    expect(res.status).toBe(500);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('marks the order FAILED on transaction.failed', async () => {
    orderFindFirst.mockResolvedValueOnce(ORDER);
    const { POST } = await import('./route');
    const res = await POST(
      webhookRequest('transaction.failed', {
        ...PAID,
        status: 'FAILED',
        metadata: { orderId: 'o1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(markOrderFailed).toHaveBeenCalledWith(expect.anything(), 'o1');
  });

  it('acknowledges a failed payment that matches no order', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { results: [] } })));
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('transaction.failed', { ...PAID, status: 'FAILED' }));
    expect(res.status).toBe(200);
  });

  it('ignores non-payment events (webhook.test)', async () => {
    const { POST } = await import('./route');
    const res = await POST(webhookRequest('webhook.test', { id: 'wt1' }));
    expect(res.status).toBe(200);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
