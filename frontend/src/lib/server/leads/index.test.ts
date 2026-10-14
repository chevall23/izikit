import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { contactOf, isAgent, isSellable, previewOf, sellableWhere, MAX_BUYERS } from './index';

const row = {
  id: 'r1',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  country: 'Bénin',
  city: 'Cotonou',
  landmark: 'Fidjrossè',
  budgetMin: 1,
  budgetMax: 2,
  priority: 'Urgent',
  delay: 'Immédiat',
  financing: 'Comptant',
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

describe('sellable rule', () => {
  const FROM = '2026-11-01T00:00:00.000Z';
  const base = {
    userId: null,
    trustStatus: 'TRUSTED',
    status: 'EN_ATTENTE',
    source: 'Site web',
    createdAt: new Date('2026-11-02T00:00:00Z'),
  };

  beforeEach(() => {
    process.env.LEADS_SALE_FROM = FROM;
  });
  afterEach(() => {
    delete process.env.LEADS_SALE_FROM;
  });

  it('only unowned, trusted, not closed, post-consent requests from public sources', () => {
    expect(sellableWhere()).toEqual({
      userId: null,
      trustStatus: 'TRUSTED',
      status: { not: 'CLOTUREE' },
      createdAt: { gte: new Date(FROM) },
      OR: [{ source: null }, { source: { notIn: ['ancien-site', 'Admin'] } }],
    });
    expect(isSellable(base)).toBe(true);
    expect(isSellable({ ...base, userId: 'a' })).toBe(false);
    expect(isSellable({ ...base, trustStatus: 'REVIEW' })).toBe(false);
    expect(isSellable({ ...base, trustStatus: 'REJECTED' })).toBe(false);
    expect(isSellable({ ...base, status: 'CLOTUREE' })).toBe(false);
  });

  it('never sells a request collected before the consent text went live', () => {
    expect(isSellable({ ...base, createdAt: new Date('2026-10-31T23:59:59Z') })).toBe(false);
    expect(isSellable({ ...base, createdAt: new Date(FROM) })).toBe(true);
  });

  it('never sells legacy-imported or admin-entered requests', () => {
    expect(isSellable({ ...base, source: 'ancien-site' })).toBe(false);
    expect(isSellable({ ...base, source: 'Admin' })).toBe(false);
    expect(isSellable({ ...base, source: null })).toBe(true);
  });

  it('sells nothing while the start date is unset or invalid', () => {
    delete process.env.LEADS_SALE_FROM;
    expect(isSellable(base)).toBe(false);
    expect(sellableWhere()).toEqual({ id: { in: [] } });
    process.env.LEADS_SALE_FROM = 'not-a-date';
    expect(isSellable(base)).toBe(false);
    expect(sellableWhere()).toEqual({ id: { in: [] } });
  });
});

describe('previewOf', () => {
  it('prices by priority and counts the remaining slots', () => {
    const p = previewOf(row, DEFAULT_PRICING, 1, false);
    expect(p).toMatchObject({ id: 'r1', price: 5, slotsLeft: MAX_BUYERS - 1, purchased: false });
  });

  it('never carries a contact field or the notes', () => {
    const p = previewOf(
      {
        ...row,
        clientName: 'X',
        clientPhone: '+229',
        clientEmail: 'a@b.c',
        notes: 'tel 97',
      } as never,
      DEFAULT_PRICING,
      0,
      false,
    );
    for (const k of ['clientName', 'clientPhone', 'clientEmail', 'clientType', 'notes']) {
      expect(p).not.toHaveProperty(k);
    }
  });

  it('never reports a negative number of slots', () => {
    expect(previewOf(row, DEFAULT_PRICING, 5, true).slotsLeft).toBe(0);
  });
});

describe('contactOf', () => {
  it('returns exactly the revealed fields', () => {
    expect(
      contactOf({
        clientName: 'A',
        clientPhone: 'B',
        clientEmail: null,
        clientType: 'Particulier',
        notes: 'n',
        extra: 1,
      } as never),
    ).toEqual({
      clientName: 'A',
      clientPhone: 'B',
      clientEmail: null,
      clientType: 'Particulier',
      notes: 'n',
    });
  });
});

describe('isAgent', () => {
  it('is true only for OWNER_AGENT accounts', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'OWNER_AGENT' } as never);
    expect(await isAgent('u1')).toBe(true);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect(await isAgent('u2')).toBe(false);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await isAgent('u3')).toBe(false);
  });
});
