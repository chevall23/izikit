// Idempotent Prisma writer for the legacy import. Every row is keyed by
// `legacyId`, so re-running with a fresher dump updates in place. Never
// touches credentials: imported users get passwordHash=null and must use
// "Mot de passe oublié" (decision recorded in the plan).
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ImportSet, UserRecord } from './build';

export const LEGACY_WALLET_DESC = "Solde reporté de l'ancien site";

export type UserAction =
  | { kind: 'update'; id: string }
  | { kind: 'link'; id: string }
  | { kind: 'create' };

export function resolveUserAction(
  byLegacy: { id: string } | null,
  byEmail: { id: string; legacyId: string | null } | null,
): UserAction {
  if (byLegacy) return { kind: 'update', id: byLegacy.id };
  if (!byEmail) return { kind: 'create' };
  if (byEmail.legacyId) throw new Error(`email already linked to ${byEmail.legacyId}`);
  return { kind: 'link', id: byEmail.id };
}

export interface WriteReport {
  users: { created: number; updated: number; linked: number; conflicts: number };
  listings: number;
  alerts: number;
  requests: number;
  wallets: number;
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

async function writeUser(
  prisma: PrismaClient,
  u: UserRecord,
  report: WriteReport,
  log: (m: string) => void,
): Promise<string | null> {
  const byLegacy = await prisma.user.findUnique({
    where: { legacyId: u.legacyId },
    select: { id: true },
  });
  const byEmail = byLegacy
    ? null
    : await prisma.user.findUnique({
        where: { email: u.email },
        select: { id: true, legacyId: true, phone: true },
      });
  let action: UserAction;
  try {
    action = resolveUserAction(byLegacy, byEmail);
  } catch (err) {
    report.users.conflicts++;
    log(`⚠ ${u.legacyId} ignoré : ${(err as Error).message}`);
    return null;
  }

  if (action.kind === 'update') {
    await prisma.user.update({
      where: { id: action.id },
      data: {
        name: u.name,
        bio: u.bio,
        country: u.country,
        accountType: u.accountType,
        phone: await freePhone(prisma, u.phone, action.id),
      },
    });
    report.users.updated++;
    return action.id;
  }

  if (action.kind === 'link') {
    const data: Prisma.UserUpdateInput = { legacyId: u.legacyId };
    if (!byEmail?.phone) data.phone = await freePhone(prisma, u.phone, action.id);
    await prisma.user.update({ where: { id: action.id }, data });
    report.users.linked++;
    return action.id;
  }

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
    users: { created: 0, updated: 0, linked: 0, conflicts: 0 },
    listings: 0,
    alerts: 0,
    requests: 0,
    wallets: 0,
  };
  const userIdByLegacy = new Map<string, string>();
  const listingIdByLegacy = new Map<string, string>();

  for (const [i, u] of set.users.entries()) {
    const id = await writeUser(prisma, u, report, log);
    if (id) userIdByLegacy.set(u.legacyId, id);
    if ((i + 1) % 250 === 0) log(`  users ${i + 1}/${set.users.length}`);
  }

  for (const [i, l] of set.listings.entries()) {
    const userId = userIdByLegacy.get(l.ownerLegacyId);
    if (!userId) continue;
    const fields = {
      userId,
      title: l.title,
      city: l.city,
      country: l.country,
      propertyType: l.propertyType,
      transactionType: l.transactionType,
      price: l.price,
      description: l.description,
      landmark: l.landmark,
      surfaceM2: l.surfaceM2,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      kitchens: l.kitchens,
      viewCount: l.viewCount,
      createdAt: l.createdAt,
    };
    const existing = await prisma.listing.findUnique({
      where: { legacyId: l.legacyId },
      select: { id: true, status: true },
    });
    // Don't undo a moderation decision taken on the new site (REJECTED, SOLD…).
    const keepStatus = existing !== null && !['VERIFIED', 'DRAFT'].includes(existing.status);
    const row = existing
      ? await prisma.listing.update({
          where: { id: existing.id },
          data: keepStatus ? fields : { ...fields, status: l.status },
          select: { id: true },
        })
      : await prisma.listing.create({
          data: { ...fields, legacyId: l.legacyId, status: l.status },
          select: { id: true },
        });
    listingIdByLegacy.set(l.legacyId, row.id);
    report.listings++;
    if ((i + 1) % 500 === 0) log(`  listings ${i + 1}/${set.listings.length}`);
  }

  for (const a of set.alerts) {
    const userId = userIdByLegacy.get(a.ownerLegacyId);
    if (!userId) continue;
    const fields = {
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
    };
    await prisma.alert.upsert({
      where: { legacyId: a.legacyId },
      create: { ...fields, legacyId: a.legacyId },
      update: fields,
    });
    report.alerts++;
  }

  for (const r of set.requests) {
    const { legacyId, ...rest } = r;
    const data = {
      ...rest,
      financing: 'Les deux',
      delay: 'Flexible',
      clientName: 'Visiteur (ancien site)',
      source: 'ancien-site',
    };
    await prisma.propertyRequest.upsert({
      where: { legacyId },
      create: { ...data, legacyId },
      update: data,
    });
    report.requests++;
  }

  for (const w of set.wallets) {
    const userId = userIdByLegacy.get(w.ownerLegacyId);
    if (!userId) continue;
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
    report.wallets++;
  }

  return { report, userIdByLegacy, listingIdByLegacy };
}
