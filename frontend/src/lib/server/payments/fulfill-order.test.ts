import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/listings/quota', () => ({
  lockUserListingQuota: vi.fn(),
  reactivateHiddenListings: vi.fn(),
}));
vi.mock('@/lib/server/pricing', () => ({ getPricing: vi.fn() }));

import { lockUserListingQuota, reactivateHiddenListings } from '@/lib/server/listings/quota';
import { getPricing } from '@/lib/server/pricing';
import { fulfillPaidOrder } from './fulfill-order';

const mockLock = vi.mocked(lockUserListingQuota);
const mockReactivate = vi.mocked(reactivateHiddenListings);
const subscriptionFindUnique = vi.fn();
const subscriptionUpsert = vi.fn();
const tokenWalletUpsert = vi.fn();
const tokenTransactionCreate = vi.fn();
const outboxCreate = vi.fn();

const tx = {
  subscription: { findUnique: subscriptionFindUnique, upsert: subscriptionUpsert },
  tokenWallet: { upsert: tokenWalletUpsert },
  tokenTransaction: { create: tokenTransactionCreate },
  outboxEvent: { create: outboxCreate },
} as never;

beforeEach(() => {
  subscriptionFindUnique.mockReset().mockResolvedValue(null);
  mockLock.mockReset().mockResolvedValue(undefined);
  mockReactivate.mockReset().mockResolvedValue(0);
  vi.mocked(getPricing).mockResolvedValue(DEFAULT_PRICING);
  subscriptionUpsert.mockReset();
  tokenWalletUpsert.mockReset().mockResolvedValue({ userId: 'u1', balance: 150 });
  tokenTransactionCreate.mockReset();
  outboxCreate.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;
const NOW = new Date('2026-11-10T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const subOrder = (planKey: string) => ({
  id: 'o1',
  userId: 'u1',
  customerEmail: null,
  amount: 29_900,
  currency: 'XOF',
  metadata: { kind: 'subscription_plan_change', planKey },
});

describe('subscription renewal and reactivation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('carries the remaining days over when renewing the same running plan', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: at(10),
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'ACTIVE', currentPeriodEnd: at(40) }),
      }),
    );
  });

  it('carries over for a CANCELED subscription still inside its period', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'CANCELED',
      currentPeriodEnd: at(10),
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'ACTIVE',
          currentPeriodEnd: at(40),
          canceledAt: null,
        }),
      }),
    );
  });

  it('starts from now on a plan change (no carry-over)', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: at(10),
    });
    await fulfillPaidOrder(tx, subOrder('AGENCY_PREMIUM'));
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ planKey: 'AGENCY_PREMIUM', currentPeriodEnd: at(30) }),
      }),
    );
  });

  it('starts from now after the grace period and clears canceledAt', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'GRACE',
      currentPeriodEnd: at(-3),
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentPeriodEnd: at(30) }),
        update: expect.objectContaining({ currentPeriodEnd: at(30), canceledAt: null }),
      }),
    );
  });

  it('starts from now when the same plan already lapsed while still marked ACTIVE', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: at(-1),
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ currentPeriodEnd: at(30) }),
      }),
    );
  });

  it('reactivates hidden listings with the quota of the plan paid', async () => {
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(mockReactivate).toHaveBeenLastCalledWith(tx, 'u1', 30);
    await fulfillPaidOrder(tx, subOrder('AGENCY_PREMIUM'));
    expect(mockReactivate).toHaveBeenLastCalledWith(tx, 'u1', null);
  });

  it('takes the per-user listing quota lock before reactivating', async () => {
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(mockLock).toHaveBeenCalledWith(tx, 'u1');
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockReactivate.mock.invocationCallOrder[0] as number,
    );
  });

  it('does not touch listings for a token purchase', async () => {
    await fulfillPaidOrder(tx, {
      ...subOrder('PRO_AGENT'),
      metadata: { kind: 'token_purchase', packKey: 'STANDARD' },
    });
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockLock).not.toHaveBeenCalled();
  });
});

describe('fulfillPaidOrder', () => {
  it('activates a subscription when metadata.kind is subscription_plan_change', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 29_900,
      currency: 'XOF',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        update: expect.objectContaining({ planKey: 'PRO_AGENT', status: 'ACTIVE' }),
      }),
    );
  });

  it('credits the token wallet when metadata.kind is token_purchase', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 40_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD' },
    });
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: { userId: 'u1', balance: 150 },
        update: { balance: { increment: 150 } },
      }),
    );
    expect(tokenTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'PURCHASE',
          amount: 150,
          orderId: 'o1',
        }),
      }),
    );
  });

  it('prefers the frozen token count when the server freeze marker matches the amount', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 10_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 40, priceFcfa: 10_000 },
    });
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'u1', balance: 40 },
        update: { balance: { increment: 40 } },
      }),
    );
  });

  it('ignores client-supplied tokens on a legacy order without the freeze marker', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 36_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 1_000_000 },
    });
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { increment: 150 } } }),
    );
  });

  it('ignores tokens when priceFcfa does not match the order amount', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 36_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 1_000_000, priceFcfa: 1 },
    });
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { increment: 150 } } }),
    );
  });

  it('falls back to the catalog default when frozen tokens are invalid', async () => {
    for (const tokens of [0, -5, 1.5, '40']) {
      tokenWalletUpsert.mockClear();
      await fulfillPaidOrder(tx, {
        id: 'o1',
        userId: 'u1',
        customerEmail: null,
        amount: 36_000,
        currency: 'XOF',
        metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens, priceFcfa: 36_000 },
      });
      expect(tokenWalletUpsert, String(tokens)).toHaveBeenCalledWith(
        expect.objectContaining({ update: { balance: { increment: 150 } } }),
      );
    }
  });

  it('credits the token wallet when metadata.kind is token_purchase_custom', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 3_500,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 7 },
    });
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: { userId: 'u1', balance: 7 },
        update: { balance: { increment: 7 } },
      }),
    );
    expect(tokenTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'PURCHASE',
          amount: 7,
          orderId: 'o1',
        }),
      }),
    );
  });

  it('ignores a non-positive or non-integer token_purchase_custom amount', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 0,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 0 },
    });
    await fulfillPaidOrder(tx, {
      id: 'o2',
      userId: 'u1',
      customerEmail: null,
      amount: 100,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 1.5 },
    });
    expect(tokenWalletUpsert).not.toHaveBeenCalled();
  });

  it('ignores an unknown packKey', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 40_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'NOT_A_REAL_PACK' },
    });
    expect(tokenWalletUpsert).not.toHaveBeenCalled();
  });

  it('enqueues a notification event when userId is present', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: 'u1',
      customerEmail: null,
      amount: 1000,
      currency: 'XOF',
    });
    const kinds = outboxCreate.mock.calls.map(
      (c) => (c[0] as { data: { kind: string } }).data.kind,
    );
    expect(kinds).toContain('notification.payment_received');
  });

  it('enqueues an email confirmation event when customerEmail is present', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: null,
      customerEmail: 'a@b.com',
      amount: 1000,
      currency: 'XOF',
    });
    const kinds = outboxCreate.mock.calls.map(
      (c) => (c[0] as { data: { kind: string } }).data.kind,
    );
    expect(kinds).toContain('email.payment_confirmation');
  });

  it('does nothing beyond outbox skips when userId and customerEmail are both null', async () => {
    await fulfillPaidOrder(tx, {
      id: 'o1',
      userId: null,
      customerEmail: null,
      amount: 1000,
      currency: 'XOF',
    });
    expect(outboxCreate).not.toHaveBeenCalled();
    expect(subscriptionUpsert).not.toHaveBeenCalled();
    expect(tokenWalletUpsert).not.toHaveBeenCalled();
  });
});
