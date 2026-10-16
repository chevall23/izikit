import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteAlertWithNotifications } from './delete';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.notification.deleteMany.mockResolvedValue({ count: 2 } as never);
  prismaMock.alert.delete.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation(
    (ops: unknown) => Promise.all(ops as Promise<unknown>[]) as never,
  );
});

describe('deleteAlertWithNotifications', () => {
  it('removes the ALERT_MATCH notifications of that alert and the alert itself, in one transaction', async () => {
    await deleteAlertWithNotifications(prismaMock, 'al_1');
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { type: 'ALERT_MATCH', dedupeKey: { startsWith: 'alert-match:al_1:' } },
    });
    expect(prismaMock.alert.delete).toHaveBeenCalledWith({ where: { id: 'al_1' } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not touch the notifications of another alert (prefix includes the closing colon)', async () => {
    await deleteAlertWithNotifications(prismaMock, 'al_1');
    const arg = prismaMock.notification.deleteMany.mock.calls[0]?.[0] as {
      where: { dedupeKey: { startsWith: string } };
    };
    expect('alert-match:al_10:rq_1'.startsWith(arg.where.dedupeKey.startsWith)).toBe(false);
  });
});
