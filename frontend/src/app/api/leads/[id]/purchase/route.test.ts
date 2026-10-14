import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: null,
  trustStatus: 'TRUSTED',
  status: 'EN_ATTENTE',
  priority: 'Normale',
  city: 'Cotonou',
  clientName: 'Awa',
  clientPhone: '+22997000000',
  clientEmail: 'a@b.c',
  clientType: 'Particulier',
  notes: 'rappeler',
  ...over,
});
const call = () =>
  POST(
    new NextRequest('http://test/api/leads/r1/purchase', {
      method: 'POST',
      headers: { 'x-csrf-token': 't' },
    }),
    { params: Promise.resolve({ id: 'r1' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
  prismaMock.propertyRequest.findUnique.mockResolvedValue(request() as never);
  prismaMock.leadPurchase.findUnique.mockResolvedValue(null);
  prismaMock.leadPurchase.count.mockResolvedValue(0);
  prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 10 } as never);
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 7 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.leadPurchase.create.mockResolvedValue({ id: 'p1' } as never);
});

describe('POST /api/leads/[id]/purchase', () => {
  it('rejects CSRF failures and anonymous callers', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent, no debit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    const res = await call();
    expect(res.status).toBe(403);
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('charges 3 tokens, reveals the contact, writes a USAGE transaction', async () => {
    const res = await call();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      charged: true,
      tokenBalance: 7,
      contact: { clientName: 'Awa', clientPhone: '+22997000000', notes: 'rappeler' },
    });
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 3 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'agent-1',
        type: 'USAGE',
        amount: -3,
        balanceAfter: 7,
        description: 'Achat de lead — Cotonou',
      }),
    });
    expect(prismaMock.leadPurchase.create).toHaveBeenCalledWith({
      data: { requestId: 'r1', agentId: 'agent-1', tokensSpent: 3 },
    });
  });

  it('charges 5 tokens for an Urgent request', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(
      request({ priority: 'Urgent' }) as never,
    );
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: 5 } as never);
    await call();
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 5 } } }),
    );
  });

  it('422 INSUFFICIENT_TOKENS with required/balance, nothing written', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 2 } as never);
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: 'INSUFFICIENT_TOKENS',
      required: 3,
      balance: 2,
    });
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('422 when a concurrent spend drives the balance negative inside the tx', async () => {
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: -1 } as never);
    const res = await call();
    expect(res.status).toBe(422);
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('409 LEAD_FULL on the 4th buyer, no debit', async () => {
    prismaMock.leadPurchase.count.mockResolvedValue(3);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_FULL');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it.each([
    ['REVIEW', { trustStatus: 'REVIEW' }],
    ['CLOTUREE', { status: 'CLOTUREE' }],
    ['agent-owned', { userId: 'someone' }],
  ])('409 LEAD_UNAVAILABLE for a %s request, no debit', async (_n, over) => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(request(over) as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_UNAVAILABLE');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('409 LEAD_UNAVAILABLE for a missing request', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
  });

  it('re-buying is free and returns the contact (even if the request is no longer sellable)', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' } as never);
    prismaMock.propertyRequest.findUnique.mockResolvedValue(
      request({ trustStatus: 'REVIEW' }) as never,
    );
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ charged: false, contact: { clientName: 'Awa' } });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('a refunded agent cannot buy the same request again', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED' } as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_UNAVAILABLE');
  });

  it('takes the per-request advisory lock before reading', async () => {
    await call();
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'lead:r1',
    );
    const lockOrder = prismaMock.$executeRawUnsafe.mock.invocationCallOrder.at(-1)!;
    const readOrder = prismaMock.propertyRequest.findUnique.mock.invocationCallOrder.at(-1)!;
    expect(lockOrder).toBeLessThan(readOrder);
  });
});
