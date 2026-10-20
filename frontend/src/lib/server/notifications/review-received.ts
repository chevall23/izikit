// Tells an agent that someone rated them: always an in-app notification, and an
// e-mail only for a low rating (2/5 or less) so the agent can react — a mail
// per good review would just be noise. Best-effort, never throws.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { notifyUser } from './notify-user';
import { newReviewNotification } from './templates';
import { reviewReceivedEmail } from '../emails/account-notices';

const LOW_RATING_MAX = 2;

export async function notifyAgentOfReview(
  prisma: PrismaClient,
  review: { id: string; agentId: string; rating: number; comment: string },
  authorLabel: string,
): Promise<void> {
  await notifyUser(
    prisma,
    newReviewNotification(review.agentId, review.id, review.rating, authorLabel, review.comment),
    review.rating <= LOW_RATING_MAX
      ? reviewReceivedEmail(review.agentId, review.rating, authorLabel, review.comment)
      : undefined,
  );
}
