// Where an old habitat-afrik.com URL should land. The legacy PHP pages took
// raw numeric ids (detail-annonce.php?annonce=<idannonce>,
// demarcheur-detail.php?demarcheur=<iddem>); the import kept them as
// legacyId "ann:<id>" / "dem:<id>" (scripts/legacy-import/). Apache rewrites
// those URLs to /ancienne-annonce/<id> and /ancien-agent/<id>, whose route
// handlers 301 to the path returned here.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { listingPath } from '@/lib/seo/listing';

const NUMERIC_ID = /^\d{1,10}$/;

export async function legacyListingTarget(legacyId: string): Promise<string> {
  if (!NUMERIC_ID.test(legacyId)) return '/annonces';
  const listing = await prisma.listing.findUnique({
    where: { legacyId: `ann:${legacyId}` },
    select: {
      id: true,
      status: true,
      propertyType: true,
      transactionType: true,
      city: true,
      bedrooms: true,
    },
  });
  return listing?.status === 'VERIFIED' ? listingPath(listing) : '/annonces';
}

export async function legacyAgentTarget(legacyId: string): Promise<string> {
  if (!NUMERIC_ID.test(legacyId)) return '/agents';
  const user = await prisma.user.findUnique({
    where: { legacyId: `dem:${legacyId}` },
    select: { id: true, accountType: true },
  });
  return user?.accountType === 'OWNER_AGENT' ? `/agents/${user.id}` : '/agents';
}
