// Shared "can the owner still edit this listing" gate, used by
// PATCH /api/listings/[id], POST /api/listings/[id]/photos, and
// DELETE /api/listings/[id]/photos/[photoId] — kept in one place so the
// three routes can't silently drift apart on which statuses are editable.
//
// SOLD is the only terminal status: once a listing is marked sold, fields
// and photos are frozen (matches `NON_MODERATABLE` in
// lib/server/listings/moderation.ts treating SOLD as non-actionable).
// Everything else — including VERIFIED and PENDING, now that
// `PATCH .../route.ts` publishes straight to VERIFIED with no moderation
// gate — stays editable, since owners need to fix a live listing without
// first getting an admin to knock it back down to DRAFT.
import 'server-only';

export const LISTING_EDITABLE_STATUSES = new Set(['DRAFT', 'PENDING', 'VERIFIED', 'REJECTED']);

export function isListingEditable(status: string): boolean {
  return LISTING_EDITABLE_STATUSES.has(status);
}
