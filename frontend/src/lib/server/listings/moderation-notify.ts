// Tells the listing's owner what the moderators decided: validated (now
// public) or refused (with the reason, so the agent knows what to fix). Both
// an in-app notification and an e-mail, honouring the owner's preferences.
// Best-effort — never throws, so it cannot fail the admin action.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import { notifyUser } from '../notifications/notify-user';
import {
  listingApprovedNotification,
  listingRejectedNotification,
} from '../notifications/templates';
import { listingApprovedEmail, listingRejectedEmail } from '../emails/account-notices';

const log = createLogger();

export async function notifyListingDecision(
  prisma: PrismaClient,
  listingIds: string[],
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  for (const id of listingIds) {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id },
        select: { id: true, title: true, userId: true, moderatedAt: true },
      });
      if (!listing || !listing.userId) continue;
      const at = listing.moderatedAt ?? new Date();
      const title = listing.title?.trim() || 'Votre annonce';
      if (decision === 'approved') {
        await notifyUser(
          prisma,
          listingApprovedNotification(listing.userId, listing.id, title, at),
          listingApprovedEmail(title),
        );
      } else {
        const why = reason?.trim() || 'Non précisé';
        await notifyUser(
          prisma,
          listingRejectedNotification(listing.userId, listing.id, title, why, at),
          listingRejectedEmail(title, why, listing.id),
        );
      }
    } catch (err) {
      log.warn('listing-decision notify failed', {
        listingId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
