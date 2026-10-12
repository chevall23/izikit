// "Agent vérifié" for public listings: an agent is verified once EVERY
// required legal document (RCCM, tax certificate, ID card) has been
// validated by an admin (LegalDocument.status = VERIFIED). Same definition as
// the KYC completion shown on the agent directory and profile
// (verifiedDocCount >= verifiedDocTotal), so the listing badge and the KYC
// badge can never disagree.
//
// This is independent of Listing.status: a VERIFIED listing has passed
// moderation and is public; the "Vérifié" badge on it additionally requires
// its agent to be verified.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { LEGAL_DOCUMENT_TYPES } from '@/app/api/legal-documents/route';

const REQUIRED_DOCUMENT_COUNT = LEGAL_DOCUMENT_TYPES.length;

/** The subset of `userIds` whose required legal documents are all validated. */
export async function verifiedAgentIds(userIds: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Set();

  const counts = await prisma.legalDocument.groupBy({
    by: ['userId'],
    where: {
      userId: { in: unique },
      status: 'VERIFIED',
      type: { in: [...LEGAL_DOCUMENT_TYPES] },
    },
    _count: { _all: true },
  });

  return new Set(
    counts.filter((r) => r._count._all >= REQUIRED_DOCUMENT_COUNT).map((r) => r.userId),
  );
}
