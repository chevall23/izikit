// Public agent directory — single source for GET /api/public/agents and the
// server-rendered /agents page. An "agent" is any User with
// accountType=OWNER_AGENT, regardless of whether they have published
// listings yet. Query params are best-effort: anything malformed is silently
// ignored rather than rejected, since this backs a public navigation page.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { LEGAL_DOCUMENT_TYPE_COUNT } from '@/lib/server/users/enrich';

const DEFAULT_LIMIT = 9;
const MAX_LIMIT = 24;

function parsePage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function parsePositiveFloat(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const AGENT_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  city: true,
  country: true,
  bio: true,
  createdAt: true,
} as const;

export type PublicAgentsResult = Awaited<ReturnType<typeof searchPublicAgents>>;
export type PublicAgentItem = PublicAgentsResult['items'][number];

export async function searchPublicAgents(params: URLSearchParams) {
  const search = params.get('search')?.trim() || undefined;
  const country = params.get('country')?.trim() || undefined;
  const transactionType = params.get('transactionType')?.trim() || undefined;
  // Property type filter — used by the "Terrain" directory tab, since
  // the real Listing.transactionType enum (VENTE|LOCATION|SEJOUR|AUBERGE)
  // has no "terrain" value; "terrain" is really propertyType=PARCELLE.
  const propertyType = params.get('propertyType')?.trim() || undefined;
  const minRating = parsePositiveFloat(params.get('minRating'));
  const page = parsePage(params.get('page'));
  const limit = parseLimit(params.get('limit'));
  // `sort=listings` ranks agents by their number of VERIFIED listings
  // (most first) — used by the homepage "Nos agents certifiés" section and
  // the /agents directory. Without it, agents come back newest-first.
  const sortByListings = params.get('sort') === 'listings';

  // Rating average isn't a column — it's derived from AgentReview, so a
  // minRating filter can't live in the Prisma `where` directly. Compute
  // every agent's average once and turn the threshold into an `id: { in }`
  // clause instead. Fine at this project's scale (starter directory, not
  // a high-volume marketplace) — same acceptable-tradeoff posture as the
  // unfiltered hero stats below.
  let qualifyingIds: string[] | null = null;
  if (minRating !== undefined) {
    const allRatings = await prisma.agentReview.groupBy({
      by: ['agentId'],
      _avg: { rating: true },
    });
    qualifyingIds = allRatings
      .filter((r) => (r._avg.rating ?? 0) >= minRating)
      .map((r) => r.agentId);
  }

  function buildWhere(omitCountry = false): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { accountType: 'OWNER_AGENT' };
    if (country && !omitCountry) where.country = country;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (transactionType || propertyType) {
      where.listings = {
        some: {
          status: 'VERIFIED',
          ...(transactionType && { transactionType }),
          ...(propertyType && { propertyType }),
        },
      };
    }
    if (qualifyingIds) where.id = { in: qualifyingIds };
    return where;
  }

  const baseWhere = buildWhere();

  // The listing count is a filtered relation count (status=VERIFIED), which
  // Prisma's relation `_count` orderBy can't express — so rank in memory over
  // every matching agent. Same scale tradeoff as the hero stats below.
  async function findRowsByListingCount() {
    const [ranked, matching] = await Promise.all([
      prisma.listing.groupBy({
        by: ['userId'],
        where: { status: 'VERIFIED', user: baseWhere },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: AGENT_SELECT,
      }),
    ]);
    const countByUser = new Map(ranked.map((r) => [r.userId, r._count._all]));
    // Array.prototype.sort is stable: ties keep the newest-first order.
    return matching
      .sort((a, b) => (countByUser.get(b.id) ?? 0) - (countByUser.get(a.id) ?? 0))
      .slice((page - 1) * limit, page * limit);
  }

  const [rows, total, countryFacet, totalAgentsAll, agentCountries] = await Promise.all([
    sortByListings
      ? findRowsByListingCount()
      : prisma.user.findMany({
          where: baseWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: AGENT_SELECT,
        }),
    prisma.user.count({ where: baseWhere }),
    prisma.user.groupBy({
      by: ['country'],
      where: buildWhere(true),
      _count: { _all: true },
    }),
    prisma.user.count({ where: { accountType: 'OWNER_AGENT' } }),
    prisma.user.findMany({
      where: { accountType: 'OWNER_AGENT', country: { not: null } },
      distinct: ['country'],
      select: { country: true },
    }),
  ]);

  const agentIds = rows.map((r) => r.id);

  const [listingCounts, docCounts, ratingGroups] = await Promise.all([
    agentIds.length
      ? prisma.listing.groupBy({
          by: ['userId'],
          where: { userId: { in: agentIds }, status: 'VERIFIED' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.legalDocument.groupBy({
          by: ['userId'],
          where: { userId: { in: agentIds }, status: 'VERIFIED' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    agentIds.length
      ? prisma.agentReview.groupBy({
          by: ['agentId'],
          where: { agentId: { in: agentIds } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const listingCountByUser = new Map(listingCounts.map((r) => [r.userId, r._count._all]));
  const docCountByUser = new Map(docCounts.map((r) => [r.userId, r._count._all]));
  const ratingByAgent = new Map(
    ratingGroups.map((r) => [r.agentId, { avg: r._avg.rating, count: r._count._all }]),
  );

  // Directory-wide banner stats — deliberately unfiltered by the current
  // search/country/transactionType so the hero numbers stay stable while
  // the user browses. Scoped to every OWNER_AGENT rather than just this
  // page — acceptable at this project's scale (a starter directory, not
  // a high-volume marketplace).
  const allAgentIds = (
    await prisma.user.findMany({
      where: { accountType: 'OWNER_AGENT' },
      select: { id: true },
    })
  ).map((r) => r.id);

  const allDocCounts = allAgentIds.length
    ? await prisma.legalDocument.groupBy({
        by: ['userId'],
        where: { userId: { in: allAgentIds }, status: 'VERIFIED' },
        _count: { _all: true },
      })
    : [];
  const fullyVerifiedCount = allDocCounts.filter(
    (r) => r._count._all >= LEGAL_DOCUMENT_TYPE_COUNT,
  ).length;

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl,
    city: r.city,
    country: r.country,
    bio: r.bio,
    createdAt: new Date(r.createdAt).toISOString(),
    listingCount: listingCountByUser.get(r.id) ?? 0,
    verifiedDocCount: docCountByUser.get(r.id) ?? 0,
    verifiedDocTotal: LEGAL_DOCUMENT_TYPE_COUNT,
    ratingAvg: ratingByAgent.get(r.id)?.avg ?? null,
    reviewCount: ratingByAgent.get(r.id)?.count ?? 0,
  }));

  const countries = countryFacet
    .map((r) => ({ value: r.country, count: r._count._all }))
    .filter((c): c is { value: string; count: number } => c.value !== null)
    .sort((a, b) => b.count - a.count);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    facets: { countries },
    stats: {
      totalAgents: totalAgentsAll,
      countriesCount: agentCountries.length,
      fullyVerifiedPercent:
        totalAgentsAll > 0 ? Math.round((fullyVerifiedCount / totalAgentsAll) * 100) : 0,
    },
  };
}
