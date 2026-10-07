// Who may open a sensitive document: its owner, or a back-office admin
// (ADMIN / SUPERADMIN — the moderators who verify documents).
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { roleRank } from '@/lib/server/middleware/require-admin';
import type { AdminRole } from '@/lib/server/middleware/require-admin';

export async function canOpenDocument(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } });
  return !!viewer && roleRank(viewer.role as AdminRole) >= roleRank('ADMIN');
}
