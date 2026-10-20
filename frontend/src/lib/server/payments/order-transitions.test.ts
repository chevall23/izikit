import { describe, it, expect, vi } from 'vitest';
import { markOrderPaid, readWholeAmount } from './order-transitions';
import type { PrismaTransactionClient } from '../webhook/handler';

vi.mock('./fulfill-order', () => ({ fulfillPaidOrder: vi.fn(async () => undefined) }));

const order = { id: 'o1', userId: 'u1', customerEmail: null, amount: 36000, currency: 'XOF' };

function txWith(count: number) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  return { tx: { order: { updateMany } } as unknown as PrismaTransactionClient, updateMany };
}

describe('readWholeAmount', () => {
  it('rounds provider decimals to whole units', () => {
    expect(readWholeAmount('1260.00')).toBe(1260);
    expect(readWholeAmount('12.6')).toBe(13);
    expect(readWholeAmount(undefined)).toBeUndefined();
    expect(readWholeAmount('abc')).toBeUndefined();
  });
});

describe('markOrderPaid', () => {
  it('records the fee the platform bears and the net it receives', async () => {
    const { tx, updateMany } = txWith(1);
    expect(await markOrderPaid(tx, order, { feeAmount: 1260, netAmount: 34740 })).toBe(true);
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({
      status: 'PAID',
      commissionAmount: 1260,
      netAmount: 34740,
    });
  });

  it('refuses a payment whose amount differs from the order', async () => {
    const { tx, updateMany } = txWith(1);
    expect(await markOrderPaid(tx, order, { paidAmount: 100 })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when the order is no longer payable', async () => {
    const { tx } = txWith(0);
    expect(await markOrderPaid(tx, order, {})).toBe(false);
  });
});
