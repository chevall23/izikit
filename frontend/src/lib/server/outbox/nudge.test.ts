import { describe, it, expect, vi, beforeEach } from 'vitest';

const drainOutbox = vi.fn();
const getEmailQueue = vi.fn();
const warn = vi.fn();

vi.mock('./dispatcher', () => ({ drainOutbox: (...a: unknown[]) => drainOutbox(...a) }));
vi.mock('../queues/email-queue-singleton', () => ({ getEmailQueue: () => getEmailQueue() }));
vi.mock('../prisma', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('../observability/log', () => ({ log: { warn: (...a: unknown[]) => warn(...a) } }));

import { nudgeOutbox } from './nudge';

beforeEach(() => {
  vi.clearAllMocks();
  drainOutbox.mockResolvedValue({ processed: 1, succeeded: 1, failed: 0, dead: 0 });
});

describe('nudgeOutbox', () => {
  it('drains the outbox, then sends the queued emails until the queue is empty', async () => {
    const drainOne = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const queue = { drainOne };
    getEmailQueue.mockReturnValue(queue);

    await nudgeOutbox('test');

    expect(drainOutbox).toHaveBeenCalledWith({ prisma: { tag: 'prisma' }, emailQueue: queue }, 10);
    expect(drainOne).toHaveBeenCalledTimes(2);
    expect(drainOutbox.mock.invocationCallOrder[0]).toBeLessThan(
      drainOne.mock.invocationCallOrder[0]!,
    );
  });

  it('caps the email drain at 10 jobs', async () => {
    const drainOne = vi.fn().mockResolvedValue(true);
    getEmailQueue.mockReturnValue({ drainOne });

    await nudgeOutbox('test');

    expect(drainOne).toHaveBeenCalledTimes(10);
  });

  it('still drains the outbox (notification.* events) when no email queue is configured', async () => {
    getEmailQueue.mockReturnValue(null);

    await nudgeOutbox('test');

    expect(drainOutbox).toHaveBeenCalledWith({ prisma: { tag: 'prisma' } }, 10);
  });

  it('never throws — failures are logged and left to the crons', async () => {
    getEmailQueue.mockReturnValue({ drainOne: vi.fn() });
    drainOutbox.mockRejectedValue(new Error('db down'));

    await expect(nudgeOutbox('forgot-password')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'outbox nudge failed (cron will retry)',
      expect.objectContaining({ reason: 'forgot-password', err: 'db down' }),
    );
  });
});
