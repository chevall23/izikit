import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./index', () => ({ createNotification: vi.fn() }));
const enqueue = vi.fn();
const drainOne = vi.fn().mockResolvedValue(true);
vi.mock('../queues/email-queue-singleton', () => ({
  getEmailQueue: () => ({ enqueue, drainOne }),
}));

import { createNotification } from './index';
import { notifyUser } from './notify-user';

const input = {
  userId: 'u1',
  type: 'LISTING_REJECTED',
  title: 't',
  body: 'b',
  dedupeKey: 'k',
};
const email = ({ firstName }: { firstName: string }) => ({
  subject: `s ${firstName}`,
  html: '<p/>',
  text: 't',
});

function user(prefs: unknown = null, name: string | null = 'Awa Sossou') {
  prismaMock.user.findUnique.mockResolvedValue({
    email: 'awa@example.com',
    name,
    notifPrefs: prefs === null ? null : { prefs },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({ id: 'n1' } as never);
});

describe('notifyUser', () => {
  it('creates the notification and e-mails the user with their first name', async () => {
    user();
    expect(await notifyUser(prismaMock, input, email)).toBe(true);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'awa@example.com', subject: 's Awa' }),
    );
  });

  it('sends no e-mail for a duplicate event', async () => {
    user();
    vi.mocked(createNotification).mockResolvedValue(null);
    expect(await notifyUser(prismaMock, input, email)).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('honours an e-mail opt-out but still shows the notification', async () => {
    user({ LISTING_REJECTED: { email: false } });
    expect(await notifyUser(prismaMock, input, email)).toBe(true);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('honours an in-app opt-out but still e-mails', async () => {
    user({ LISTING_REJECTED: { inApp: false } });
    await notifyUser(prismaMock, input, email);
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('works without an e-mail builder (in-app only)', async () => {
    user();
    expect(await notifyUser(prismaMock, input)).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error('db down'));
    expect(await notifyUser(prismaMock, input, email)).toBe(false);
  });
});
