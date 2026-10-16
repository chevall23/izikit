import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueue = vi.fn();
const drainOne = vi.fn();
vi.mock('../queues/email-queue-singleton', () => ({
  getEmailQueue: () => ({ enqueue, drainOne }),
}));
vi.mock('../notifications', () => ({ createNotification: vi.fn() }));

import { createNotification } from '../notifications';
import { notifyAdminsOfReviewRequest } from './review-notify';

const mockCreate = vi.mocked(createNotification);
const request = {
  id: 'rq_1',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Bénin',
  city: 'Cotonou',
};

beforeEach(() => {
  vi.clearAllMocks();
  enqueue.mockResolvedValue(undefined);
  drainOne.mockResolvedValue(undefined);
  prismaMock.user.findMany.mockResolvedValue([
    { id: 'ad_1', email: 'a1@x.com' },
    { id: 'ad_2', email: 'a2@x.com' },
  ] as never);
  mockCreate.mockResolvedValue({ id: 'n' } as never);
});

describe('notifyAdminsOfReviewRequest', () => {
  it('targets ADMIN and SUPERADMIN, notifies each in-app and by email', async () => {
    await notifyAdminsOfReviewRequest(prismaMock, request, ['NAME_JUNK']);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: { in: ['ADMIN', 'SUPERADMIN'] } } }),
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0]?.[1]).toMatchObject({
      userId: 'ad_1',
      type: 'REQUEST_REVIEW',
      dedupeKey: 'request-review:ad_1:rq_1',
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('skips the email for an admin already notified (duplicate)', async () => {
    mockCreate.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'n' } as never);
    await notifyAdminsOfReviewRequest(prismaMock, request, []);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({ to: 'a2@x.com' });
  });

  it('never throws and keeps going when one admin fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({ id: 'n' } as never);
    await expect(notifyAdminsOfReviewRequest(prismaMock, request, [])).resolves.toBeUndefined();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('never throws when the admin lookup fails', async () => {
    prismaMock.user.findMany.mockRejectedValueOnce(new Error('down'));
    await expect(notifyAdminsOfReviewRequest(prismaMock, request, [])).resolves.toBeUndefined();
  });
});
