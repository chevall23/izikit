// ADMIN-REQUESTS-01 — GET /api/admin/property-requests
//
// Filtered, cursor-paginated queue for /admin/demandes. Mirrors
// GET /api/admin/listings: requireAdmin('ADMIN') → enforceAdminRateLimit
// → parse filters → findMany(take limit+1) → buildPage. Adds a `counts`
// block (one count() per status) for the status tabs. Unlike listings
// there is no DRAFT concept — "Toutes" is every PropertyRequest.
// Empty result is 200 { items: [] }, never 404.
//
// ADMIN-REQUESTS-05 — POST /api/admin/property-requests
//
// Admin-authored "demande immobilière" ("Nouvelle demande" on
// /admin/demandes). Same field set as the agent form (POST /api/requests)
// but userId = null (unowned — an agent picks it up via sector-alert
// matching). Feeds the new request into runMatchingForNewRequest and
// audits property_request.create.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { runMatchingForNewRequest } from '@/lib/server/alerts/matching';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';
import { buildRequestFilterWhere } from './_filters';

const log = createLogger();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));

    // counts reflect every filter EXCEPT status (tabs show per-status totals
    // of the otherwise-filtered set).
    const filterWhere = buildRequestFilterWhere(sp);
    const countsWhere: Prisma.PropertyRequestWhereInput = { ...filterWhere };
    delete (countsWhere as Record<string, unknown>).status;

    // AND-combine so the cursor's OR (createdAt keyset) can't overwrite the
    // filter's OR (q → clientName/city contains).
    const listWhere: Prisma.PropertyRequestWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, all, enAttente, enCours, cloturee] = await Promise.all([
      prisma.propertyRequest.findMany({
        where: listWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          clientEmail: true,
          country: true,
          city: true,
          propertyType: true,
          transactionType: true,
          budgetMin: true,
          budgetMax: true,
          priority: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.propertyRequest.count({ where: countsWhere }),
      prisma.propertyRequest.count({ where: { ...countsWhere, status: 'EN_ATTENTE' } }),
      prisma.propertyRequest.count({ where: { ...countsWhere, status: 'EN_COURS' } }),
      prisma.propertyRequest.count({ where: { ...countsWhere, status: 'CLOTUREE' } }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = (page.items as typeof rows).map((r) => ({
      id: r.id,
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      clientEmail: r.clientEmail,
      country: r.country,
      city: r.city,
      propertyType: r.propertyType,
      transactionType: r.transactionType,
      budgetMin: r.budgetMin,
      budgetMax: r.budgetMax,
      priority: r.priority,
      status: r.status,
      createdAt: r.createdAt,
      owner: r.user ? { id: r.user.id, name: r.user.name } : null,
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, counts: { all, enAttente, enCours, cloturee } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

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

const CreateBody = z.object({
  transactionType: z.enum(TRANSACTION_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  country: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  landmark: z.string().trim().max(200).optional(),
  bedrooms: z.string().trim().min(1).max(40).optional(),
  salons: z.string().trim().min(1).max(40).optional(),
  surfaceM2: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  amenities: z.array(z.string().max(40)).max(30).default([]),
  priority: z.enum(PRIORITIES).default('Normale'),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  financing: z.enum(FINANCINGS),
  delay: z.enum(DELAYS),
  clientName: z.string().trim().min(1).max(200),
  clientPhone: z.string().trim().min(1).max(40),
  clientEmail: z.string().trim().email().max(200).optional(),
  clientType: z.enum(CLIENT_TYPES).default('Particulier'),
  notes: z.string().trim().max(4000).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const created = await prisma.propertyRequest.create({
      data: {
        userId: null,
        transactionType: data.transactionType,
        propertyType: data.propertyType,
        country: data.country,
        city: data.city,
        landmark: data.landmark ?? null,
        bedrooms: data.bedrooms ?? null,
        salons: data.salons ?? null,
        surfaceM2: data.surfaceM2 ?? null,
        capacity: data.capacity ?? null,
        amenities: data.amenities,
        priority: data.priority,
        budgetMin: data.budgetMin ?? null,
        budgetMax: data.budgetMax ?? null,
        financing: data.financing,
        delay: data.delay,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        clientEmail: data.clientEmail ?? null,
        clientType: data.clientType,
        notes: data.notes ?? null,
        source: 'Admin',
      },
      select: { id: true, status: true, createdAt: true },
    });

    let notifiedAgents = 0;
    try {
      notifiedAgents = await runMatchingForNewRequest(prisma, {
        id: created.id,
        userId: null,
        transactionType: data.transactionType,
        propertyType: data.propertyType,
        country: data.country,
        city: data.city,
        budgetMin: data.budgetMin ?? null,
        budgetMax: data.budgetMax ?? null,
        clientName: data.clientName,
      });
    } catch (err) {
      log.warn('admin property-request: matching failed for new request', {
        requestId: created.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'property_request.create',
      targetType: 'PropertyRequest',
      targetId: created.id,
      metadata: { notifiedAgents },
    });

    return NextResponse.json(
      { request: created, notifiedAgents },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
