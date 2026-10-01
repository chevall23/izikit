// Idempotent Prisma writer for the legacy import. Every row is keyed by
// `legacyId` and the import only ever CREATES: a row that already exists is
// left exactly as it is, so a rerun (crash recovery, fresher dump) can never
// undo what users or admins changed on the new site. Existing users only get
// their empty profile fields filled in. Never touches credentials: imported
// users get passwordHash=null and must use "Mot de passe oublié".
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ImportSet, UserRecord } from './build';

export const LEGACY_WALLET_DESC = "Solde reporté de l'ancien site";

export type UserAction =
  | { kind: 'update'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'create' };

/**
 * `byEmail.legacyId` set to a different id means the same person: the account
 * kept for a duplicated legacy email changed between two dumps. Reuse it.
 */
export function resolveUserAction(
  byLegacy: { id: string } | null,
  byEmail: { id: string; legacyId: string | null } | null,
): UserAction {
  if (byLegacy) return { kind: 'update', id: byLegacy.id };
  if (!byEmail) return { kind: 'create' };
  if (byEmail.legacyId) return { kind: 'update', id: byEmail.id };
  return { kind: 'link', id: byEmail.id };
}

interface ExistingProfile {
  name: string | null;
  bio: string | null;
  country: string | null;
  phone: string | null;
  accountType: string;
}

/** Fill-only patch: never overwrites a set field, only upgrades TENANT → AGENT. */
export function profilePatch(
  existing: ExistingProfile,
  u: UserRecord,
  phone: string | null,
): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};
  if (!existing.name && u.name) data.name = u.name;
  if (!existing.bio && u.bio) data.bio = u.bio;
  if (!existing.country && u.country) data.country = u.country;
  if (!existing.phone && phone) data.phone = phone;
  if (u.accountType === 'OWNER_AGENT' && existing.accountType !== 'OWNER_AGENT') {
    data.accountType = 'OWNER_AGENT';
  }
  return data;
}

export interface WriteReport {
  users: { created: number; updated: number; linked: number };
  listings: { created: number; existing: number; ownerUnresolved: number };
  alerts: { created: number; existing: number; ownerUnresolved: number };
  requests: { created: number; existing: number };
  wallets: { credited: number; ownerUnresolved: number };
}

/** Returns `phone` unless another user already holds it (User.phone is unique). */
async function freePhone(
  prisma: PrismaClient,
  phone: string | null,
  selfId: string | null,
): Promise<string | null> {
  if (!phone) return null;
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  return !owner || owner.id === selfId ? phone : null;
}

const PROFILE_SELECT = {
  id: true,
  legacyId: true,
  name: true,
  bio: true,
  country: true,
  phone: true,
  accountType: true,
} as const;

async function writeUser(
  prisma: PrismaClient,
  u: UserRecord,
  report: WriteReport,
): Promise<string> {
  const byLegacy = await prisma.user.findUnique({
    where: { legacyId: u.legacyId },
    select: PROFILE_SELECT,
  });
  const byEmail = byLegacy
    ? null
    : await prisma.user.findUnique({ where: { email: u.email }, select: PROFILE_SELECT });
  const action = resolveUserAction(byLegacy, byEmail);

  if (action.kind === 'create') {
    const created = await prisma.user.create({
      data: {
        legacyId: u.legacyId,
        email: u.email,
        phone: await freePhone(prisma, u.phone, null),
        name: u.name,
        bio: u.bio,
        country: u.country,
        accountType: u.accountType,
        passwordHash: null,
        emailVerifiedAt: u.emailVerifiedAt,
        createdAt: u.createdAt,
      },
      select: { id: true },
    });
    report.users.created++;
    return created.id;
  }

  const existing = byLegacy ?? byEmail;
  if (!existing) throw new Error(`unreachable: ${action.kind} without a user`);
  const data = profilePatch(existing, u, await freePhone(prisma, u.phone, action.id));
  if (action.kind === 'link') data.legacyId = u.legacyId;
  if (Object.keys(data).length > 0) await prisma.user.update({ where: { id: action.id }, data });
  if (action.kind === 'link') report.users.linked++;
  else report.users.updated++;
  return action.id;
}

export async function writeImportSet(
  prisma: PrismaClient,
  set: ImportSet,
  log: (msg: string) => void = console.log,
): Promise<{
  report: WriteReport;
  userIdByLegacy: Map<string, string>;
  listingIdByLegacy: Map<string, string>;
}> {
  const report: WriteReport = {
    users: { created: 0, updated: 0, linked: 0 },
    listings: { created: 0, existing: 0, ownerUnresolved: 0 },
    alerts: { created: 0, existing: 0, ownerUnresolved: 0 },
    requests: { created: 0, existing: 0 },
    wallets: { credited: 0, ownerUnresolved: 0 },
  };
  const userIdByLegacy = new Map<string, string>();
  const listingIdByLegacy = new Map<string, string>();

  for (const [i, u] of set.users.entries()) {
    userIdByLegacy.set(u.legacyId, await writeUser(prisma, u, report));
    if ((i + 1) % 250 === 0) log(`  users ${i + 1}/${set.users.length}`);
  }

  for (const [i, l] of set.listings.entries()) {
    const existing = await prisma.listing.findUnique({
      where: { legacyId: l.legacyId },
      select: { id: true },
    });
    if (existing) {
      listingIdByLegacy.set(l.legacyId, existing.id);
      report.listings.existing++;
      continue;
    }
    const userId = userIdByLegacy.get(l.ownerLegacyId);
    if (!userId) {
      report.listings.ownerUnresolved++;
      continue;
    }
    const row = await prisma.listing.create({
      data: {
        legacyId: l.legacyId,
        userId,
        title: l.title,
        city: l.city,
        country: l.country,
        propertyType: l.propertyType,
        transactionType: l.transactionType,
        price: l.price,
        status: l.status,
        description: l.description,
        landmark: l.landmark,
        surfaceM2: l.surfaceM2,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        kitchens: l.kitchens,
        viewCount: l.viewCount,
        createdAt: l.createdAt,
      },
      select: { id: true },
    });
    listingIdByLegacy.set(l.legacyId, row.id);
    report.listings.created++;
    if ((i + 1) % 500 === 0) log(`  listings ${i + 1}/${set.listings.length}`);
  }

  for (const a of set.alerts) {
    if (await prisma.alert.findUnique({ where: { legacyId: a.legacyId }, select: { id: true } })) {
      report.alerts.existing++;
      continue;
    }
    const userId = userIdByLegacy.get(a.ownerLegacyId);
    if (!userId) {
      report.alerts.ownerUnresolved++;
      continue;
    }
    await prisma.alert.create({
      data: {
        legacyId: a.legacyId,
        userId,
        name: a.name,
        transactionType: a.transactionType,
        propertyTypes: a.propertyTypes,
        country: a.country,
        cities: a.cities,
        notifWhatsapp: a.notifWhatsapp,
        notifEmail: a.notifEmail,
        active: a.active,
        createdAt: a.createdAt,
      },
    });
    report.alerts.created++;
  }

  for (const r of set.requests) {
    const exists = await prisma.propertyRequest.findUnique({
      where: { legacyId: r.legacyId },
      select: { id: true },
    });
    if (exists) {
      report.requests.existing++;
      continue;
    }
    await prisma.propertyRequest.create({
      data: {
        ...r,
        financing: 'Les deux',
        delay: 'Flexible',
        clientName: 'Visiteur (ancien site)',
        source: 'ancien-site',
      },
    });
    report.requests.created++;
  }

  for (const w of set.wallets) {
    const userId = userIdByLegacy.get(w.ownerLegacyId);
    if (!userId) {
      report.wallets.ownerUnresolved++;
      continue;
    }
    const done = await prisma.tokenTransaction.findFirst({
      where: { userId, type: 'BONUS', description: LEGACY_WALLET_DESC },
      select: { id: true },
    });
    if (done) continue;
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.upsert({
        where: { userId },
        create: { userId, balance: w.balance },
        update: { balance: { increment: w.balance } },
      });
      await tx.tokenTransaction.create({
        data: {
          userId,
          type: 'BONUS',
          amount: w.balance,
          balanceAfter: wallet.balance,
          description: LEGACY_WALLET_DESC,
        },
      });
    });
    report.wallets.credited++;
  }

  return { report, userIdByLegacy, listingIdByLegacy };
}
