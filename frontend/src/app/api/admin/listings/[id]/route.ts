// ADMIN-LISTINGS-02 — GET / PATCH / DELETE /api/admin/listings/[id]
//
// GET    — full moderation detail (owner identity, photos, documents,
//          inquiry/report counts, last moderator).
// PATCH  — admin override edit: any field, any status, no owner check.
//          Optional forced `status`; REJECTED requires `rejectionReason`.
// DELETE — hard delete (cascade wipes photos/docs/inquiries/reports/views).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
  deleteListing,
  ModerationError,
  asModerationClient,
} from '@/lib/server/listings/moderation';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
const FORCED_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'SOLD'] as const;

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
  status: z.enum(FORCED_STATUSES).optional(),
  rejectionReason: z.string().trim().min(3).max(500).optional(),
});

const DETAIL_SELECT = {
  id: true,
  title: true,
  description: true,
  landmark: true,
  city: true,
  country: true,
  propertyType: true,
  transactionType: true,
  price: true,
  currency: true,
  status: true,
  surfaceM2: true,
  capacity: true,
  yearBuilt: true,
  standing: true,
  roomsTotal: true,
  bedrooms: true,
  bathrooms: true,
  kitchens: true,
  amenities: true,
  viewCount: true,
  rejectionReason: true,
  rejectedAt: true,
  moderatedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
  moderatedBy: { select: { id: true, name: true } },
  photos: {
    orderBy: { position: 'asc' },
    select: { id: true, url: true, key: true, isPrimary: true, position: true },
  },
  documents: { select: { id: true, type: true, status: true, url: true, filename: true } },
} as const;

function jsonError(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json(
    { error: code, message },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const listing = await prisma.listing.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!listing) return jsonError('LISTING_NOT_FOUND', 'Listing not found', 404, reqCtx.requestId);

    const [listingCount, inquiryCount, reportCount] = await Promise.all([
      prisma.listing.count({ where: { userId: listing.user.id, status: { not: 'DRAFT' } } }),
      prisma.listingInquiry.count({ where: { listingId: id } }),
      prisma.listingReport.count({ where: { listingId: id } }),
    ]);

    const { user, ...rest } = listing;
    return NextResponse.json(
      {
        listing: {
          ...rest,
          owner: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            listingCount,
          },
          inquiryCount,
          reportCount,
        },
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
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

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError('VALIDATION_FAILED', 'Invalid request body', 400, reqCtx.requestId);
    }
    const { status, rejectionReason, ...fields } = parsed.data;
    if (status === 'REJECTED' && !rejectionReason) {
      return jsonError(
        'VALIDATION_FAILED',
        'rejectionReason is required when status is REJECTED',
        400,
        reqCtx.requestId,
      );
    }

    const existing = await prisma.listing.findUnique({ where: { id }, select: { id: true } });
    if (!existing)
      return jsonError('LISTING_NOT_FOUND', 'Listing not found', 404, reqCtx.requestId);

    const data: Record<string, unknown> = { ...fields };
    if (status) {
      data.status = status;
      if (status === 'REJECTED') {
        data.rejectionReason = rejectionReason;
        data.rejectedAt = new Date();
        data.moderatedById = auth.admin.id;
        data.moderatedAt = new Date();
      } else if (status === 'VERIFIED') {
        data.rejectionReason = null;
        data.rejectedAt = null;
        data.moderatedById = auth.admin.id;
        data.moderatedAt = new Date();
      }
    }

    const updated = await prisma.listing.update({ where: { id }, data, select: DETAIL_SELECT });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing.update',
      targetType: 'Listing',
      targetId: id,
      metadata: { fields: Object.keys(data) },
    });

    const { user, ...rest } = updated;
    return NextResponse.json(
      {
        listing: {
          ...rest,
          owner: { id: user.id, name: user.name, email: user.email, phone: user.phone },
        },
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
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

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.listing.findUnique({
      where: { id },
      select: { id: true, title: true, userId: true, status: true },
    });
    if (!existing)
      return jsonError('LISTING_NOT_FOUND', 'Listing not found', 404, reqCtx.requestId);

    try {
      await deleteListing(asModerationClient(prisma), { id });
    } catch (err) {
      if (err instanceof ModerationError && err.code === 'LISTING_NOT_FOUND') {
        return jsonError('LISTING_NOT_FOUND', 'Listing not found', 404, reqCtx.requestId);
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'listing.delete',
      targetType: 'Listing',
      targetId: id,
      metadata: { title: existing?.title, ownerId: existing?.userId, status: existing?.status },
    });

    return new NextResponse(null, { status: 204, headers: { 'x-request-id': reqCtx.requestId } });
  });
}
