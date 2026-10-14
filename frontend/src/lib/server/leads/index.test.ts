import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
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
  it('only unowned, trusted, not closed requests', () => {
    expect(sellableWhere()).toEqual({
      userId: null,
      trustStatus: 'TRUSTED',
      status: { not: 'CLOTUREE' },
    });
    expect(isSellable({ userId: null, trustStatus: 'TRUSTED', status: 'EN_ATTENTE' })).toBe(true);
    expect(isSellable({ userId: 'a', trustStatus: 'TRUSTED', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'REVIEW', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'REJECTED', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'TRUSTED', status: 'CLOTUREE' })).toBe(false);
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
