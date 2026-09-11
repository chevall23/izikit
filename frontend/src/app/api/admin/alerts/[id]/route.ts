// ADMIN-ALERTS-02 — GET / PATCH / DELETE /api/admin/alerts/[id]
//
// GET    — full detail for the /admin/alerte-secteur drawer: every field,
//          owner identity, and the recorded matches (with the linked
//          property request). requireAdmin('ADMIN') → no owner check.
//          404 (not 403) on missing.
// PATCH  — admin edit + active toggle + optional re-run of the sector-alert
//          matching engine. Body is any subset of the editable fields plus:
//            active?:  boolean
//            rematch?: boolean  — runMatchingForNewAlert; idempotent per
//                      (alert, request) pair, so it only notifies the
//                      owning agent about requests they weren't told about.
//          priceMin / priceMax accept an explicit null to clear. Every
//          call is audited via logAdminAction.
// DELETE — hard delete (cascade wipes the AlertMatch rows). Audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewAlert } from '@/lib/server/alerts/matching';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

const TRANSACTION_TYPES = ['VENTE', 'LOCATION', 'SEJOUR', 'AUBERGE'] as const;
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
const FREQUENCIES = ['QUOTIDIENNE', 'HEBDOMADAIRE'] as const;

const BASE_SELECT = {
  id: true,
  name: true,
  transactionType: true,
  propertyTypes: true,
  country: true,
  cities: true,
  priceMin: true,
  priceMax: true,
  frequency: true,
  notifWhatsapp: true,
  notifEmail: true,
  notifSms: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

const DETAIL_SELECT = {
  ...BASE_SELECT,
  matches: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      propertyRequest: {
        select: {
          id: true,
          transactionType: true,
          propertyType: true,
          country: true,
          city: true,
          budgetMin: true,
          budgetMax: true,
          clientName: true,
          status: true,
          createdAt: true,
        },
      },
    },
  },
} as const;

type Row = {
  user: { id: string; name: string | null; email: string; phone: string | null } | null;
  propertyTypes: unknown;
  cities: unknown;
} & Record<string, unknown>;

function serialize(row: Row) {
  const { user, ...rest } = row;
  return {
    ...rest,
    propertyTypes: Array.isArray(rest.propertyTypes) ? rest.propertyTypes : [],
    cities: Array.isArray(rest.cities) ? rest.cities : [],
    owner: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
  };
}

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
    const row = await prisma.alert.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) return jsonError('ALERT_NOT_FOUND', 'Alert not found', 404, reqCtx.requestId);

    return NextResponse.json(
      { alert: serialize(row as unknown as Row) },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const PatchBody = z
  .object({
    active: z.boolean().optional(),
    rematch: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    transactionType: z.enum(TRANSACTION_TYPES).optional(),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).min(1).max(PROPERTY_TYPES.length).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    cities: z.array(z.string().trim().min(1).max(120)).min(1).max(10).optional(),
    priceMin: z.number().int().nonnegative().nullable().optional(),
    priceMax: z.number().int().nonnegative().nullable().optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    notifWhatsapp: z.boolean().optional(),
    notifEmail: z.boolean().optional(),
    notifSms: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Empty patch' });

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
    const { rematch, ...fields } = parsed.data;

    const existing = await prisma.alert.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        active: true,
        name: true,
        transactionType: true,
        propertyTypes: true,
        country: true,
        cities: true,
        priceMin: true,
        priceMax: true,
        notifEmail: true,
        notifSms: true,
        notifWhatsapp: true,
      },
    });
    if (!existing) return jsonError('ALERT_NOT_FOUND', 'Alert not found', 404, reqCtx.requestId);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) data[k] = v;
    }
    // priceMin > priceMax guard against the effective (merged) values.
    const effMin = ('priceMin' in data ? data.priceMin : existing.priceMin) as number | null;
    const effMax = ('priceMax' in data ? data.priceMax : existing.priceMax) as number | null;
    if (effMin != null && effMax != null && effMin > effMax) {
      return jsonError('VALIDATION_FAILED', 'priceMin must be <= priceMax', 400, reqCtx.requestId);
    }

    if (Object.keys(data).length > 0) {
      await prisma.alert.update({ where: { id }, data });
    }

    let notifiedRequests: number | null = null;
    if (rematch) {
      const merged = { ...existing, ...data } as typeof existing;
      try {
        notifiedRequests = await runMatchingForNewAlert(prisma, {
          id: existing.id,
          userId: existing.userId,
          name: merged.name,
          transactionType: merged.transactionType,
          propertyTypes: merged.propertyTypes,
          country: merged.country,
          cities: merged.cities,
          priceMin: merged.priceMin,
          priceMax: merged.priceMax,
          notifEmail: merged.notifEmail,
          notifSms: merged.notifSms,
          notifWhatsapp: merged.notifWhatsapp,
        });
      } catch (err) {
        notifiedRequests = 0;
        log.warn('admin alert: rematch failed', {
          alertId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const editedFields = Object.keys(data).filter((k) => k !== 'active');
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'alert.update',
      targetType: 'Alert',
      targetId: id,
      metadata: {
        ...('active' in data ? { active: data.active, previousActive: existing.active } : {}),
        ...(editedFields.length > 0 ? { fields: editedFields } : {}),
        ...(rematch ? { rematch: true, notifiedRequests } : {}),
      },
    });

    const row = await prisma.alert.findUnique({ where: { id }, select: DETAIL_SELECT });
    return NextResponse.json(
      {
        alert: serialize(row as unknown as Row),
        ...(rematch ? { notifiedRequests } : {}),
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
    const existing = await prisma.alert.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true },
    });
    if (!existing) return jsonError('ALERT_NOT_FOUND', 'Alert not found', 404, reqCtx.requestId);

    await prisma.alert.delete({ where: { id } });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'alert.delete',
      targetType: 'Alert',
      targetId: id,
      metadata: { name: existing.name, ownerId: existing.userId },
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
