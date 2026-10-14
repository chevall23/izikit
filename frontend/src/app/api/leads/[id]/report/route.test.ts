import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const call = (body: unknown = { reason: 'INVALID_NUMBER' }) =>
  POST(
    new NextRequest('http://test/api/leads/r1/report', {
      method: 'POST',
      headers: { 'x-csrf-token': 't', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'r1' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
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
  prismaMock.leadPurchase.findUnique.mockResolvedValue({
    id: 'p1',
    status: 'ACTIVE',
    tokensSpent: 3,
    createdAt: hoursAgo(2),
  } as never);
  prismaMock.leadPurchase.count.mockResolvedValue(0);
  prismaMock.leadPurchase.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 13 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.propertyRequest.findUnique.mockResolvedValue({
    trustStatus: 'TRUSTED',
    trustFlags: ['SOME_FLAG'],
  } as never);
  prismaMock.propertyRequest.update.mockResolvedValue({} as never);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/leads/[id]/report', () => {
  it('guards: csrf, auth, agent-only, body', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect((await call()).status).toBe(403);
    expect((await call({ reason: 'AUTRE' })).status).toBe(400);
  });

  it('refunds the exact amount, frees the slot, writes a REFUND transaction', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      refunded: true,
      tokensRefunded: 3,
      tokenBalance: 13,
    });
    expect(prismaMock.leadPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'ACTIVE' },
      data: expect.objectContaining({
        status: 'REFUNDED',
        reportReason: 'INVALID_NUMBER',
        reportedAt: NOW,
        refundedAt: NOW,
      }),
    });
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { increment: 3 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'agent-1',
        type: 'REFUND',
        amount: 3,
        balanceAfter: 13,
        description: 'Remboursement de lead',
      }),
    });
  });

  it('moves a TRUSTED request to REVIEW and appends the signal', async () => {
    await call();
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { trustStatus: 'REVIEW', trustFlags: ['SOME_FLAG', 'LEAD_REPORTED_INVALID_NUMBER'] },
    });
  });

  it('leaves an already non-trusted request untouched', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      trustStatus: 'REJECTED',
      trustFlags: [],
    } as never);
    await call();
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('is idempotent: a refunded purchase is not refunded twice', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'REFUNDED',
      tokensSpent: 3,
      createdAt: hoursAgo(2),
    } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, alreadyRefunded: true });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('is idempotent under a concurrent double submit (updateMany count 0)', async () => {
    prismaMock.leadPurchase.updateMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyRefunded: true });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(prismaMock.tokenTransaction.create).not.toHaveBeenCalled();
  });

  it('404 PURCHASE_NOT_FOUND without a purchase', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PURCHASE_NOT_FOUND');
  });

  it('409 REPORT_WINDOW_CLOSED after 72h, no refund', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'ACTIVE',
      tokensSpent: 3,
      createdAt: hoursAgo(73),
    } as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('REPORT_WINDOW_CLOSED');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('409 REFUND_LIMIT after 2 refunds in the last 30 days', async () => {
    prismaMock.leadPurchase.count.mockResolvedValue(2);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('REFUND_LIMIT');
    expect(prismaMock.leadPurchase.count).toHaveBeenCalledWith({
      where: {
        agentId: 'agent-1',
        status: 'REFUNDED',
        refundedAt: { gte: new Date(NOW.getTime() - 30 * 86_400_000) },
      },
    });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('takes the request lock, then the per-agent refund lock', async () => {
    await call();
    expect(prismaMock.$executeRawUnsafe.mock.calls.map((c) => c[1])).toEqual([
      'lead:r1',
      'leadrefund:agent-1',
    ]);
  });
});
