// Deletes an Alert and everything that made it visible to its owner.
//
// AlertMatch rows go with the alert (onDelete: Cascade), which removes the
// matched requests from the agent's /alertes space. The in-app notifications
// already sent for those matches are plain rows with no FK to the alert, so
// they are removed here, through their deterministic dedupeKey prefix
// (`alert-match:<alertId>:<requestId>`, see notifications/templates.ts).
// Once the alert is gone, matching can no longer find it, so no new
// notification is produced either.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export const alertMatchDedupePrefix = (alertId: string) => `alert-match:${alertId}:`;

export async function deleteAlertWithNotifications(
  prisma: PrismaClient,
  alertId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: { type: 'ALERT_MATCH', dedupeKey: { startsWith: alertMatchDedupePrefix(alertId) } },
    }),
    prisma.alert.delete({ where: { id: alertId } }),
  ]);
}
