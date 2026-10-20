import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../notifications/notify-user', () => ({ notifyUser: vi.fn().mockResolvedValue(true) }));
import { notifyUser } from '../notifications/notify-user';
import { notifyListingDecision } from './moderation-notify';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.listing.findUnique.mockResolvedValue({
    id: 'l1',
    title: 'Villa Cotonou',
    userId: 'u1',
    moderatedAt: new Date('2026-10-20T10:00:00Z'),
  } as never);
});

describe('notifyListingDecision', () => {
  it('tells the owner their listing was validated', async () => {
    await notifyListingDecision(prismaMock, ['l1'], 'approved');
    const input = vi.mocked(notifyUser).mock.calls[0]![1];
    expect(input).toMatchObject({ userId: 'u1', type: 'LISTING_APPROVED' });
  });

  it('passes the refusal reason to the owner', async () => {
    await notifyListingDecision(prismaMock, ['l1'], 'rejected', 'Photos floues');
    const input = vi.mocked(notifyUser).mock.calls[0]![1];
    expect(input).toMatchObject({ type: 'LISTING_REJECTED' });
    expect(input.body).toContain('Photos floues');
  });

  it('skips listings that no longer exist and never throws', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('x'));
    await expect(
      notifyListingDecision(prismaMock, ['a', 'b'], 'approved'),
    ).resolves.toBeUndefined();
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
