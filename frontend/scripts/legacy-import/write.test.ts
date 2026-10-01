import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { ImportSet, ListingRecord, UserRecord } from './build';
import { profilePatch, resolveUserAction, writeImportSet } from './write';

describe('resolveUserAction', () => {
  it('updates a user already imported', () =>
    expect(resolveUserAction({ id: 'u1' }, { id: 'u1', legacyId: 'dem:1' })).toEqual({
      kind: 'update',
      id: 'u1',
    }));

  it('links an existing account that signed up on the new site with the same email', () =>
    expect(resolveUserAction(null, { id: 'u2', legacyId: null })).toEqual({
      kind: 'link',
      id: 'u2',
    }));

  it('creates when nothing matches', () =>
    expect(resolveUserAction(null, null)).toEqual({ kind: 'create' }));

  it('treats an email already linked to another legacy id as the same person', () =>
    expect(resolveUserAction(null, { id: 'u3', legacyId: 'dem:9' })).toEqual({
      kind: 'update',
      id: 'u3',
    }));
});

describe('profilePatch', () => {
  const u: UserRecord = {
    legacyId: 'dem:1',
    email: 'k@x.com',
    phone: '+22966000001',
    name: 'Koffi Agbo',
    bio: 'Agent à Cotonou',
    country: 'Bénin',
    accountType: 'OWNER_AGENT',
    emailVerifiedAt: null,
    createdAt: new Date(0),
  };

  it('never overwrites what the user already set on the new site', () =>
    expect(
      profilePatch(
        {
          name: 'Koffi A.',
          bio: 'moi',
          country: 'Togo',
          phone: '+22990000000',
          accountType: 'OWNER_AGENT',
        },
        u,
        u.phone,
      ),
    ).toEqual({}));

  it('fills empty fields and upgrades a tenant account to agent', () =>
    expect(
      profilePatch(
        { name: null, bio: null, country: null, phone: null, accountType: 'TENANT_BUYER' },
        u,
        u.phone,
      ),
    ).toEqual({
      name: 'Koffi Agbo',
      bio: 'Agent à Cotonou',
      country: 'Bénin',
      phone: '+22966000001',
      accountType: 'OWNER_AGENT',
    }));

  it('never downgrades an agent to tenant', () =>
    expect(
      profilePatch(
        { name: 'x', bio: 'x', country: 'x', phone: 'x', accountType: 'OWNER_AGENT' },
        { ...u, accountType: 'TENANT_BUYER' },
        null,
      ),
    ).toEqual({}));
});

// ── writeImportSet against an in-memory stand-in for the Prisma client ─────
type Row = Record<string, unknown> & { id: string };

function fakePrisma(): { prisma: PrismaClient; tables: Record<string, Row[]> } {
  let seq = 0;
  const tables: Record<string, Row[]> = {
    user: [],
    listing: [],
    alert: [],
    propertyRequest: [],
    tokenTransaction: [],
    tokenWallet: [],
  };
  const rows = (t: string): Row[] => tables[t] ?? [];
  const match = (r: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => r[k] === v);
  const model = (t: string) => ({
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      rows(t).find((r) => match(r, where)) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows(t).find((r) => match(r, where)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const r: Row = { id: `${t}${++seq}`, ...data };
      rows(t).push(r);
      return r;
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const r = rows(t).find((x) => match(x, where));
      if (!r) throw new Error(`${t} not found`);
      Object.assign(r, data);
      return r;
    },
  });
  const prisma = {
    user: model('user'),
    listing: model('listing'),
    alert: model('alert'),
    propertyRequest: model('propertyRequest'),
    tokenTransaction: model('tokenTransaction'),
    tokenWallet: {
      upsert: async (args: {
        where: { userId: string };
        create: Row;
        update: { balance: { increment: number } };
      }) => {
        const r = rows('tokenWallet').find((x) => x.userId === args.where.userId);
        if (!r) {
          const created: Row = { ...args.create, id: `w${++seq}` };
          rows('tokenWallet').push(created);
          return created;
        }
        r.balance = Number(r.balance) + args.update.balance.increment;
        return r;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, tables };
}

const agent = (legacyId: string, email: string, over: Partial<UserRecord> = {}): UserRecord => ({
  legacyId,
  email,
  phone: null,
  name: 'Ancien Nom',
  bio: null,
  country: 'Bénin',
  accountType: 'OWNER_AGENT',
  emailVerifiedAt: new Date(0),
  createdAt: new Date(0),
  ...over,
});

const listing = (legacyId: string, ownerLegacyId: string): ListingRecord => ({
  legacyId,
  ownerLegacyId,
  title: 'Villa',
  city: 'Cotonou',
  country: 'Bénin',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  price: 1000,
  status: 'VERIFIED',
  description: null,
  landmark: null,
  surfaceM2: null,
  bedrooms: null,
  bathrooms: null,
  kitchens: null,
  viewCount: 3,
  createdAt: new Date(0),
});

const set = (over: Partial<ImportSet>): ImportSet => ({
  users: [],
  listings: [],
  photos: [],
  alerts: [],
  requests: [],
  wallets: [],
  skipped: {},
  ...over,
});

const quiet = (): undefined => undefined;

describe('writeImportSet', () => {
  it('leaves a linked new-site account profile untouched across reruns', async () => {
    const { prisma, tables } = fakePrisma();
    tables.user?.push({
      id: 'real',
      email: 'k@x.com',
      legacyId: null,
      name: 'Koffi A.',
      bio: 'moi',
      country: 'Togo',
      phone: '+22990000000',
      accountType: 'TENANT_BUYER',
      passwordHash: 'bcrypt-hash',
    });
    const s = set({ users: [agent('dem:1', 'k@x.com', { phone: '+22966000001', bio: 'vieux' })] });
    await writeImportSet(prisma, s, quiet);
    const second = await writeImportSet(prisma, s, quiet);
    expect(tables.user?.[0]).toMatchObject({
      legacyId: 'dem:1',
      name: 'Koffi A.',
      bio: 'moi',
      phone: '+22990000000',
      accountType: 'OWNER_AGENT',
      passwordHash: 'bcrypt-hash',
    });
    expect(second.report.users).toMatchObject({ created: 0, linked: 0, updated: 1 });
  });

  it('keeps listings when the kept duplicate account changes between dumps', async () => {
    const { prisma, tables } = fakePrisma();
    await writeImportSet(prisma, set({ users: [agent('dem:20', 'e@x.com')] }), quiet);
    const { report } = await writeImportSet(
      prisma,
      set({ users: [agent('dem:30', 'e@x.com')], listings: [listing('ann:1', 'dem:30')] }),
      quiet,
    );
    expect(tables.user).toHaveLength(1);
    expect(tables.listing?.[0]?.userId).toBe(tables.user?.[0]?.id);
    expect(report.listings).toMatchObject({ created: 1, ownerUnresolved: 0 });
  });

  it('never overwrites listings, alerts or requests already imported', async () => {
    const { prisma, tables } = fakePrisma();
    const s = set({
      users: [agent('dem:1', 'a@x.com')],
      listings: [listing('ann:1', 'dem:1')],
      alerts: [
        {
          legacyId: 'alerte:1:VENTE',
          ownerLegacyId: 'dem:1',
          name: 'A',
          transactionType: 'VENTE',
          propertyTypes: ['VILLA'],
          country: 'Bénin',
          cities: ['Cotonou'],
          notifWhatsapp: true,
          notifEmail: true,
          active: true,
          createdAt: new Date(0),
        },
      ],
      requests: [
        {
          legacyId: 'demande:1',
          transactionType: 'LOCATION',
          propertyType: 'VILLA',
          country: 'Bénin',
          city: 'Cotonou',
          bedrooms: null,
          salons: null,
          surfaceM2: null,
          budgetMin: null,
          budgetMax: null,
          clientPhone: '',
          clientEmail: null,
          notes: null,
          status: 'EN_ATTENTE',
          createdAt: new Date(0),
        },
      ],
    });
    await writeImportSet(prisma, s, quiet);
    Object.assign(tables.listing?.[0] ?? {}, { price: 5, status: 'DRAFT', viewCount: 99 });
    Object.assign(tables.alert?.[0] ?? {}, { active: false });
    Object.assign(tables.propertyRequest?.[0] ?? {}, { status: 'EN_COURS' });
    const { report } = await writeImportSet(prisma, s, quiet);
    expect(tables.listing?.[0]).toMatchObject({ price: 5, status: 'DRAFT', viewCount: 99 });
    expect(tables.alert?.[0]?.active).toBe(false);
    expect(tables.propertyRequest?.[0]?.status).toBe('EN_COURS');
    expect(report.listings).toMatchObject({ created: 0, existing: 1 });
    expect(report.alerts).toMatchObject({ created: 0, existing: 1 });
    expect(report.requests).toMatchObject({ created: 0, existing: 1 });
  });

  it('counts rows whose owner could not be resolved instead of dropping them silently', async () => {
    const { prisma } = fakePrisma();
    const { report } = await writeImportSet(
      prisma,
      set({
        listings: [listing('ann:1', 'dem:404')],
        wallets: [{ ownerLegacyId: 'dem:404', balance: 3 }],
      }),
      quiet,
    );
    expect(report.listings.ownerUnresolved).toBe(1);
    expect(report.wallets.ownerUnresolved).toBe(1);
  });

  it('credits a legacy wallet only once across reruns', async () => {
    const { prisma, tables } = fakePrisma();
    const s = set({
      users: [agent('dem:1', 'a@x.com')],
      wallets: [{ ownerLegacyId: 'dem:1', balance: 4 }],
    });
    await writeImportSet(prisma, s, quiet);
    await writeImportSet(prisma, s, quiet);
    expect(tables.tokenWallet?.[0]?.balance).toBe(4);
    expect(tables.tokenTransaction).toHaveLength(1);
  });
});
