import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const getCheckoutStatus = vi.fn();
const verifyPayment = vi.fn();
vi.mock('../webhook/saspay', () => ({
  getSaspayHandle: () => ({ getCheckoutStatus, verifyPayment }),
}));
const markOrderPaid = vi.fn();
vi.mock('./order-transitions', () => ({ markOrderPaid: (...a: unknown[]) => markOrderPaid(...a) }));

import { reconcileSaspayOrders } from './reconcile';

function makePrisma(candidates: Array<{ id: string; providerChargeId: string | null }>) {
  const findMany = vi.fn().mockResolvedValue(candidates);
  const findUnique = vi.fn().mockResolvedValue({ id: 'o1', amount: 36000, currency: 'XOF' });
  const prisma = {
    order: { findMany, findUnique },
    $transaction: vi.fn(async (cb: (db: unknown) => unknown) => cb({ order: { findUnique } })),
  } as unknown as PrismaClient;
  return { prisma, findMany };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SASPAY_SECRET_KEY', 'sk_test_x');
});

describe('reconcileSaspayOrders', () => {
  it('is a no-op when SasPay is not configured', async () => {
    vi.stubEnv('SASPAY_SECRET_KEY', '');
    const { prisma, findMany } = makePrisma([]);
    expect(await reconcileSaspayOrders(prisma)).toEqual({ checked: 0, recovered: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('recovers an order SasPay reports as paid', async () => {
    const { prisma } = makePrisma([{ id: 'o1', providerChargeId: 'sess1' }]);
    getCheckoutStatus.mockResolvedValue({ status: 'PAID', transactionId: 'tx1' });
    verifyPayment.mockResolvedValue({ id: 'tx1', status: 'PAID', amount: 36000, currency: 'XOF' });
    markOrderPaid.mockResolvedValue(true);
    expect(await reconcileSaspayOrders(prisma)).toEqual({ checked: 1, recovered: 1 });
    expect(markOrderPaid.mock.calls[0]![2]).toMatchObject({ paidAmount: 36000 });
  });

  it('leaves an unpaid session alone', async () => {
    const { prisma } = makePrisma([{ id: 'o1', providerChargeId: 'sess1' }]);
    getCheckoutStatus.mockResolvedValue({ status: 'PENDING', transactionId: null });
    expect(await reconcileSaspayOrders(prisma)).toEqual({ checked: 1, recovered: 0 });
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  it('keeps going when SasPay fails for one order', async () => {
    const { prisma } = makePrisma([
      { id: 'o1', providerChargeId: 'a' },
      { id: 'o2', providerChargeId: 'b' },
    ]);
    getCheckoutStatus
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 'PENDING', transactionId: null });
    expect(await reconcileSaspayOrders(prisma)).toEqual({ checked: 2, recovered: 0 });
  });
});
