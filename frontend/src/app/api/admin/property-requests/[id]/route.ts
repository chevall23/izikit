// ADMIN-REQUESTS-02 — GET / PATCH /api/admin/property-requests/[id]
//
// GET   — full detail for the /admin/demandes drawer. requireAdmin('ADMIN')
//         → no owner check (admin sees every request, owned or anonymous
//         public submission). 404 (not 403) on missing, same convention as
//         GET /api/admin/listings/[id].
// PATCH — admin edit + status override + optional re-transmission. Body is
//         any subset of the editable fields plus:
//           status?:  EN_ATTENTE | EN_COURS | CLOTUREE
//           rematch?: boolean  — re-runs the sector-alert matching engine
//                     (runMatchingForNewRequest); idempotent per
//                     (alert, request) pair, so it only notifies agents
//                     whose alert started matching since the last run.
//         Nullable text/number fields accept an explicit null to clear
//         them. Every call is audited via logAdminAction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewRequest } from '@/lib/server/alerts/matching';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

const STATUSES = ['EN_ATTENTE', 'EN_COURS', 'CLOTUREE'] as const;
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
const PRIORITIES = ['Urgent', 'Normale', 'Basse'] as const;
const FINANCINGS = ['Comptant', 'Crédit', 'Les deux'] as const;
const DELAYS = ['Immédiat', '1–3 mois', '3–6 mois', 'Flexible'] as const;
const CLIENT_TYPES = ['Particulier', 'Entreprise'] as const;

const DETAIL_SELECT = {
  id: true,
  transactionType: true,
  propertyType: true,
  country: true,
  city: true,
  landmark: true,
  bedrooms: true,
  salons: true,
  surfaceM2: true,
  capacity: true,
  amenities: true,
  priority: true,
  budgetMin: true,
  budgetMax: true,
  financing: true,
  delay: true,
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  clientType: true,
  source: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

type DetailRow = {
  user: { id: string; name: string | null; email: string; phone: string | null } | null;
  amenities: unknown;
} & Record<string, unknown>;

function serialize(row: DetailRow) {
  const { user, ...rest } = row;
  return {
    ...rest,
    amenities: Array.isArray(rest.amenities) ? rest.amenities : [],
    assignedAgent: user ? { id: user.id, name: user.name, email: user.email } : null,
  };
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
    const row = await prisma.propertyRequest.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) {
      return NextResponse.json(
        { error: 'REQUEST_NOT_FOUND', message: 'Property request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { request: serialize(row as DetailRow) },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const PatchBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    rematch: z.boolean().optional(),
    transactionType: z.enum(TRANSACTION_TYPES).optional(),
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    landmark: z.string().trim().max(200).nullable().optional(),
    bedrooms: z.string().trim().max(40).nullable().optional(),
    salons: z.string().trim().max(40).nullable().optional(),
    surfaceM2: z.number().int().positive().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    amenities: z.array(z.string().max(40)).max(30).optional(),
    priority: z.enum(PRIORITIES).optional(),
    budgetMin: z.number().int().nonnegative().nullable().optional(),
    budgetMax: z.number().int().nonnegative().nullable().optional(),
    financing: z.enum(FINANCINGS).optional(),
    delay: z.enum(DELAYS).optional(),
    clientName: z.string().trim().min(1).max(200).optional(),
    clientPhone: z.string().trim().min(1).max(40).optional(),
    clientEmail: z.string().trim().email().max(200).nullable().optional(),
    clientType: z.enum(CLIENT_TYPES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
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
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { status, rematch, ...fields } = parsed.data;

    const existing = await prisma.propertyRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        transactionType: true,
        propertyType: true,
        country: true,
        city: true,
        budgetMin: true,
        budgetMax: true,
        clientName: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'REQUEST_NOT_FOUND', message: 'Property request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Only forward keys the client actually sent (undefined = "leave alone";
    // explicit null = "clear this column").
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) data[k] = v;
    }
    if (status && status !== existing.status) data.status = status;

    if (Object.keys(data).length > 0) {
      await prisma.propertyRequest.update({ where: { id }, data });
    }

    let notifiedAgents: number | null = null;
    if (rematch) {
      const merged = { ...existing, ...data } as typeof existing;
      try {
        notifiedAgents = await runMatchingForNewRequest(prisma, {
          id: existing.id,
          userId: existing.userId,
          transactionType: merged.transactionType,
          propertyType: merged.propertyType,
          country: merged.country,
          city: merged.city,
          budgetMin: merged.budgetMin ?? null,
          budgetMax: merged.budgetMax ?? null,
          clientName: merged.clientName,
        });
      } catch (err) {
        notifiedAgents = 0;
        log.warn('admin property-request: rematch failed', {
          requestId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const editedFields = Object.keys(data).filter((k) => k !== 'status');
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'property_request.update',
      targetType: 'PropertyRequest',
      targetId: id,
      metadata: {
        ...(status && status !== existing.status
          ? { status, previousStatus: existing.status }
          : {}),
        ...(editedFields.length > 0 ? { fields: editedFields } : {}),
        ...(rematch ? { rematch: true, notifiedAgents } : {}),
      },
    });

    const row = await prisma.propertyRequest.findUnique({ where: { id }, select: DETAIL_SELECT });
    return NextResponse.json(
      {
        request: serialize(row as DetailRow),
        ...(rematch ? { notifiedAgents } : {}),
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
