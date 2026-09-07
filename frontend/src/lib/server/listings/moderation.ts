// Listing moderation state machine. Pure — takes an injected Prisma-ish
// client, returns updated rows or throws ModerationError with a stable
// code the admin routes map to HTTP. No Next/HTTP imports here.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export type ModerationErrorCode =
  | 'LISTING_NOT_FOUND'
  | 'LISTING_NOT_MODERATABLE'
  | 'REASON_REQUIRED';

export class ModerationError extends Error {
  code: ModerationErrorCode;
  constructor(code: ModerationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ModerationError';
    this.code = code;
  }
}

export interface ModerationClient {
  listing: {
    findUnique(args: { where: { id: string }; select?: unknown }): Promise<{
      id: string;
      status: string;
    } | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
}

/**
 * Adapt a full PrismaClient to the narrow ModerationClient shape.
 * The one unavoidable structural cast is centralized here so route
 * call sites stay cast-free.
 */
export function asModerationClient(prisma: PrismaClient): ModerationClient {
  return prisma as unknown as ModerationClient;
}

const NON_MODERATABLE = new Set(['DRAFT', 'SOLD']);

async function loadModeratable(
  db: ModerationClient,
  id: string,
): Promise<{ id: string; status: string }> {
  const row = await db.listing.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) throw new ModerationError('LISTING_NOT_FOUND');
  if (NON_MODERATABLE.has(row.status)) throw new ModerationError('LISTING_NOT_MODERATABLE');
  return row;
}

export async function approveListing(
  db: ModerationClient,
  input: { id: string; adminId: string },
): Promise<Record<string, unknown>> {
  await loadModeratable(db, input.id);
  return db.listing.update({
    where: { id: input.id },
    data: {
      status: 'VERIFIED',
      moderatedById: input.adminId,
      moderatedAt: new Date(),
      rejectionReason: null,
      rejectedAt: null,
    },
  });
}

export async function rejectListing(
  db: ModerationClient,
  input: { id: string; adminId: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = input.reason?.trim() ?? '';
  if (!reason) throw new ModerationError('REASON_REQUIRED');
  await loadModeratable(db, input.id);
  return db.listing.update({
    where: { id: input.id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      rejectedAt: new Date(),
      moderatedById: input.adminId,
      moderatedAt: new Date(),
    },
  });
}

export async function deleteListing(db: ModerationClient, input: { id: string }): Promise<void> {
  const row = await db.listing.findUnique({
    where: { id: input.id },
    select: { id: true, status: true },
  });
  if (!row) throw new ModerationError('LISTING_NOT_FOUND');
  await db.listing.delete({ where: { id: input.id } });
}

export async function bulkModerate(
  db: ModerationClient,
  input: {
    action: 'approve' | 'reject' | 'delete';
    ids: string[];
    adminId: string;
    reason?: string;
  },
): Promise<{ ok: string[]; skipped: { id: string; code: ModerationErrorCode }[] }> {
  if (input.action === 'reject' && !input.reason?.trim()) {
    throw new ModerationError('REASON_REQUIRED');
  }
  const seen = new Set<string>();
  const ids = input.ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

  const ok: string[] = [];
  const skipped: { id: string; code: ModerationErrorCode }[] = [];

  for (const id of ids) {
    try {
      if (input.action === 'approve') {
        await approveListing(db, { id, adminId: input.adminId });
      } else if (input.action === 'reject') {
        await rejectListing(db, { id, adminId: input.adminId, reason: input.reason as string });
      } else {
        await deleteListing(db, { id });
      }
      ok.push(id);
    } catch (err) {
      if (err instanceof ModerationError) {
        skipped.push({ id, code: err.code });
      } else {
        throw err;
      }
    }
  }
  return { ok, skipped };
}
