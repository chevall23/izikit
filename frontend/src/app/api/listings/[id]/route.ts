// LISTINGS-03 — PATCH /api/listings/[id]
//
// Partial update of a DRAFT listing created by `POST /api/listings`. Two
// modes, both in one request body:
//   - `publish: false` (default) — "Enregistrer le brouillon": persists
//     whatever subset of fields the client sends, no validation beyond
//     per-field shape/range checks. Status stays DRAFT.
//   - `publish: true` — "Publier l'annonce": merges the incoming fields
//     with the listing's current values, checks every field/photo required
//     for publication is present, and only then flips status straight to
//     VERIFIED — no admin moderation gate, the listing is publicly visible
//     immediately (also clearing any prior rejectionReason / rejectedAt /
//     moderatedById / moderatedAt from an earlier admin rejection, so a
//     self-published listing never carries stale moderator attribution).
//     Missing requirements come back as 400 `PUBLISH_REQUIREMENTS_NOT_MET`
//     with a `missing` array the frontend maps to inline field errors.
//
//     ⚠️ Trust trade-off: this skips `lib/server/listings/moderation.ts`'s
//     approve/reject flow entirely for the publish path — any signed-in
//     user can put a live, publicly-searchable listing up with zero human
//     review. The admin `/api/admin/listings` reject action still exists
//     and can pull a VERIFIED listing back down after the fact, but nothing
//     blocks it from going live first. Re-add the PENDING gate here if that
//     stops being an acceptable trade-off for this project.
//
// Only the owning user can edit their own listing — 404 (not 403) on
// mismatch/missing to avoid leaking existence, same convention as the org
// routes. Editable statuses are DRAFT/PENDING/VERIFIED/REJECTED (see
// `lib/server/listings/editable.ts`); SOLD is frozen — 409 otherwise. A
// VERIFIED/PENDING listing being edited via `publish: true` just
// re-validates and stays at status VERIFIED (see the publish comment
// above); `publish: false` on one of those lets the owner save a partial
// field tweak without re-running the full requirements check.
//
// GET /api/listings/[id]
//
// Owner-only detail fetch (full field set + photos, ordered primary-first)
// used to prefill the "Modifier" edit page (`/listings/[id]/edit`) — the
// list view (`GET /api/listings`) only returns a summary + primary photo.
//
// DELETE /api/listings/[id]
//
// Lets the owner remove one of their own listings regardless of status
// (DRAFT/PENDING/VERIFIED/REJECTED/SOLD — unlike PATCH, delete isn't
// status-gated: "Mes annonces" should always be able to pull a row down).
// `onDelete: Cascade` on ListingPhoto/ListingDocument/ListingInquiry/
// ListingReport (see prisma/schema.prisma) means the DB rows go with it in
// one `prisma.listing.delete()` call. Matches the existing
// `DELETE /api/listings/[id]/photos/[photoId]` precedent: this is a DB-only
// delete, the R2 objects themselves are NOT removed (orphaned storage is a
// disclosed v1 limitation, same as that route — a future cleanup job/cron
// could sweep them).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isListingEditable } from '@/lib/server/listings/editable';

const PROPERTY_TYPES = [
  'VILLA',
  'APPARTEMENT',
  'PARCELLE',
  'DOMAINE',
  'MAISON',
  'BOUTIQUE',
  'BUREAU',
  'SALLE_FETE',
  'SALLE_CONFERENCE',
  'IMMEUBLE',
] as const;
const TRANSACTION_TYPES = ['VENTE', 'LOCATION', 'SEJOUR', 'AUBERGE'] as const;
const STANDINGS = ['BASIC', 'MID', 'HIGH'] as const;
const HALL_PROPERTY_TYPES = new Set(['SALLE_FETE', 'SALLE_CONFERENCE']);
const LAND_PROPERTY_TYPES = new Set(['PARCELLE', 'DOMAINE']);

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  landmark: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  transactionType: z.enum(TRANSACTION_TYPES).optional(),
  price: z.number().int().positive().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  surfaceM2: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  yearBuilt: z.number().int().min(1900).max(2100).optional(),
  standing: z.enum(STANDINGS).optional(),
  roomsTotal: z.number().int().nonnegative().optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().int().nonnegative().optional(),
  kitchens: z.number().int().nonnegative().optional(),
  amenities: z.array(z.string().max(40)).max(30).optional(),
  publish: z.boolean().optional(),
});

const LISTING_SELECT = {
  id: true,
  userId: true,
  title: true,
  description: true,
  landmark: true,
  city: true,
  country: true,
  propertyType: true,
  transactionType: true,
  price: true,
  currency: true,
  surfaceM2: true,
  capacity: true,
  yearBuilt: true,
  standing: true,
  roomsTotal: true,
  bedrooms: true,
  bathrooms: true,
  kitchens: true,
  amenities: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        ...LISTING_SELECT,
        photos: {
          orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
          select: { id: true, url: true, isPrimary: true, position: true },
        },
      },
    });
    if (!listing || listing.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Listing not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { listing },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.listing.findUnique({ where: { id }, select: LISTING_SELECT });
    if (!existing || existing.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Listing not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (!isListingEditable(existing.status)) {
      return NextResponse.json(
        {
          error: 'LISTING_NOT_EDITABLE',
          message: 'This listing can no longer be edited',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { publish, ...fields } = parsed.data;

    if (publish) {
      const merged = { ...existing, ...fields };
      const missing: string[] = [];
      if (!merged.title) missing.push('title');
      if (!merged.description) missing.push('description');
      if (!merged.price || merged.price <= 0) missing.push('price');
      const isHall = merged.propertyType ? HALL_PROPERTY_TYPES.has(merged.propertyType) : false;
      const isLand = merged.propertyType ? LAND_PROPERTY_TYPES.has(merged.propertyType) : false;
      if (isHall) {
        if (!merged.capacity || merged.capacity <= 0) missing.push('capacity');
      } else if (isLand) {
        if (!merged.surfaceM2 || merged.surfaceM2 <= 0) missing.push('surfaceM2');
      }
      if (!merged.city) missing.push('city');
      if (!merged.country) missing.push('country');
      if (!merged.propertyType) missing.push('propertyType');
      if (!merged.transactionType) missing.push('transactionType');

      const photoCount = await prisma.listingPhoto.count({ where: { listingId: id } });
      if (photoCount === 0) missing.push('photos');

      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'PUBLISH_REQUIREMENTS_NOT_MET', missing },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        ...(fields.title !== undefined && { title: fields.title }),
        ...(fields.description !== undefined && { description: fields.description }),
        ...(fields.city !== undefined && { city: fields.city }),
        ...(fields.country !== undefined && { country: fields.country }),
        ...(fields.propertyType !== undefined && { propertyType: fields.propertyType }),
        ...(fields.transactionType !== undefined && { transactionType: fields.transactionType }),
        ...(fields.price !== undefined && { price: fields.price }),
        ...(fields.currency !== undefined && { currency: fields.currency }),
        ...(fields.surfaceM2 !== undefined && { surfaceM2: fields.surfaceM2 }),
        ...(fields.capacity !== undefined && { capacity: fields.capacity }),
        ...(fields.yearBuilt !== undefined && { yearBuilt: fields.yearBuilt }),
        ...(fields.standing !== undefined && { standing: fields.standing }),
        ...(fields.roomsTotal !== undefined && { roomsTotal: fields.roomsTotal }),
        ...(fields.bedrooms !== undefined && { bedrooms: fields.bedrooms }),
        ...(fields.bathrooms !== undefined && { bathrooms: fields.bathrooms }),
        ...(fields.kitchens !== undefined && { kitchens: fields.kitchens }),
        ...(fields.amenities !== undefined && { amenities: fields.amenities }),
        ...(publish && {
          status: 'VERIFIED',
          rejectionReason: null,
          rejectedAt: null,
          moderatedById: null,
          moderatedAt: null,
        }),
      },
      select: LISTING_SELECT,
    });

    return NextResponse.json(
      { listing: updated },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const existing = await prisma.listing.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing || existing.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Listing not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.listing.delete({ where: { id } });

    return NextResponse.json(
      { deleted: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
