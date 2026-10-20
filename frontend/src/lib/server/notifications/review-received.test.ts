import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./notify-user', () => ({ notifyUser: vi.fn().mockResolvedValue(true) }));
import { notifyUser } from './notify-user';
import { notifyAgentOfReview } from './review-received';
import { newReviewNotification } from './templates';

beforeEach(() => vi.clearAllMocks());

const review = (rating: number) => ({ id: 'r1', agentId: 'a1', rating, comment: 'Très réactif' });

describe('notifyAgentOfReview', () => {
  it('always notifies in the app, one notification per review', async () => {
    await notifyAgentOfReview(prismaMock, review(5), 'Awa S.');
    const input = vi.mocked(notifyUser).mock.calls[0]![1];
    expect(input).toMatchObject({ userId: 'a1', type: 'NEW_REVIEW', dedupeKey: 'review:r1' });
  });

  it('does not e-mail for a good rating', async () => {
    await notifyAgentOfReview(prismaMock, review(4), 'Awa S.');
    expect(vi.mocked(notifyUser).mock.calls[0]![2]).toBeUndefined();
  });

  it('e-mails the agent for a low rating', async () => {
    await notifyAgentOfReview(prismaMock, review(2), 'Awa S.');
    expect(vi.mocked(notifyUser).mock.calls[0]![2]).toBeTypeOf('function');
  });
});

describe('newReviewNotification', () => {
  it('names the author, the rating and a comment preview', () => {
    const n = newReviewNotification('a1', 'r1', 3, 'Awa S.', 'x'.repeat(300));
    expect(n.title).toBe('Nouvel avis : 3/5');
    expect(n.body).toContain('Awa S. vous a noté 3/5');
    expect(n.body).toContain('…');
    expect(n.body.length).toBeLessThan(260);
  });

  it('works without a comment', () => {
    expect(newReviewNotification('a1', 'r1', 5, 'Awa S.', '').body).toContain('5/5.');
  });
});
