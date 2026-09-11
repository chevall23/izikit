// ADMIN-01 — GET /api/admin/users (list with q + status + role + type +
// country + date-range filters, cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     buildUserFilterWhere(sp) → prisma.user.findMany(take=limit+1, …) →
//     buildPage → enrich (type/displayStatus/annonces/jetons/kyc) → return
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt + the counts below.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildUserFilterWhere } from './_filters';
import {
  computeUserType,
  computeDisplayStatus,
  LEGAL_DOCUMENT_TYPE_COUNT,
} from '@/lib/server/users/enrich';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  phone: true,
  accountType: true,
  country: true,
  city: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  _count: { select: { listings: true, ownedOrganizations: true } },
  tokenWallet: { select: { balance: true } },
} as const satisfies Prisma.UserSelect;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const sp = url.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));

    const filterWhere = buildUserFilterWhere(sp);
    // "counts" reflect every filter EXCEPT type (tabs show per-type totals
    // of the otherwise-filtered set) — mirrors admin/listings' status tabs.
    const countsWhere: Prisma.UserWhereInput = { ...filterWhere };
    delete (countsWhere as Record<string, unknown>).accountType;
    delete (countsWhere as Record<string, unknown>).ownedOrganizations;

    const listWhere: Prisma.UserWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

    const [rows, total, particuliers, agences, demarcheursCandidates, newLast7d] =
      await Promise.all([
        prisma.user.findMany({
          where: listWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: USER_SELECT,
        }),
        prisma.user.count({ where: countsWhere }),
        prisma.user.count({ where: { ...countsWhere, accountType: 'TENANT_BUYER' } }),
        prisma.user.count({
          where: { ...countsWhere, accountType: 'OWNER_AGENT', ownedOrganizations: { some: {} } },
        }),
        prisma.user.count({
          where: { ...countsWhere, accountType: 'OWNER_AGENT', ownedOrganizations: { none: {} } },
        }),
        prisma.user.count({ where: { ...countsWhere, createdAt: { gte: sevenDaysAgo } } }),
      ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    const items = page.items as typeof rows;
    const ownerAgentIds = items.filter((r) => r.accountType === 'OWNER_AGENT').map((r) => r.id);

    const docCounts = ownerAgentIds.length
      ? await prisma.legalDocument.groupBy({
          by: ['userId'],
          where: { userId: { in: ownerAgentIds }, status: 'VERIFIED' },
          _count: { _all: true },
        })
      : [];
    const verifiedDocCountByUser = new Map((docCounts ?? []).map((r) => [r.userId, r._count._all]));

    // Pending-KYC-verification KPI (unfiltered — matches admin/listings'
    // convention of unfiltered header KPIs staying stable while browsing).
    // Two lightweight counts rather than a full active-agent scan: an
    // agent still has an open review if they've submitted nothing yet, or
    // have at least one document sitting in PENDING.
    const [pendingNoDocs, pendingSomePending] = await Promise.all([
      prisma.user.count({
        where: { accountType: 'OWNER_AGENT', status: 'ACTIVE', legalDocuments: { none: {} } },
      }),
      prisma.user.count({
        where: {
          accountType: 'OWNER_AGENT',
          status: 'ACTIVE',
          legalDocuments: { some: { status: 'PENDING' } },
        },
      }),
    ]);
    const pendingVerification = (pendingNoDocs ?? 0) + (pendingSomePending ?? 0);

    const mapped = items.map((r) => {
      const verifiedDocCount = verifiedDocCountByUser.get(r.id) ?? 0;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        avatarUrl: r.avatarUrl,
        phone: r.phone,
        country: r.country,
        city: r.city,
        role: r.role,
        status: r.status,
        type: computeUserType({
          accountType: r.accountType,
          ownedOrgCount: r._count?.ownedOrganizations ?? 0,
        }),
        displayStatus: computeDisplayStatus({
          status: r.status,
          accountType: r.accountType,
          verifiedDocCount,
        }),
        annonces: r._count?.listings ?? 0,
        jetons: r.tokenWallet?.balance ?? 0,
        verifiedDocCount,
        verifiedDocTotal: r.accountType === 'OWNER_AGENT' ? LEGAL_DOCUMENT_TYPE_COUNT : 0,
        emailVerifiedAt: r.emailVerifiedAt,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json(
      {
        items: mapped,
        nextCursor: page.nextCursor,
        counts: {
          all: total,
          particulier: particuliers,
          agence: agences,
          demarcheur: demarcheursCandidates,
        },
        stats: { total, newLast7d, pendingVerification },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
