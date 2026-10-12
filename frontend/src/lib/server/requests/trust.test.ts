import { prismaMock } from '@/test-utils/prisma-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  TRUST_THRESHOLD,
  assessRequestTrust,
  budgetFlags,
  phoneKeyOf,
  scoreFlags,
  type TrustInput,
} from './trust';

const good: TrustInput = {
  clientName: 'Aïcha Koné',
  clientPhone: '+229 97 12 45 68',
  clientEmail: 'aicha.kone@gmail.com',
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: 'Bénin',
  city: 'Cotonou',
  budgetMin: 80_000_000,
  budgetMax: 200_000_000,
};

const prisma = prismaMock as unknown as PrismaClient;

beforeEach(() => {
  prismaMock.listing.findMany.mockResolvedValue([] as never);
  prismaMock.propertyRequest.count.mockResolvedValue(0 as never);
});

describe('scoreFlags', () => {
  it('trusts a request with no flag', () => {
    expect(scoreFlags([])).toEqual({ score: 100, status: 'TRUSTED' });
  });

  it('keeps a single mild flag trusted', () => {
    expect(scoreFlags(['EMAIL_PATTERN']).status).toBe('TRUSTED');
    expect(scoreFlags(['BUDGET_IMPLAUSIBLE']).score).toBe(TRUST_THRESHOLD);
    expect(scoreFlags(['BUDGET_IMPLAUSIBLE']).status).toBe('TRUSTED');
  });

  it('sends a strong flag, or two mild ones, to review', () => {
    expect(scoreFlags(['PHONE_PATTERN']).status).toBe('REVIEW');
    expect(scoreFlags(['EMAIL_PATTERN', 'BUDGET_IMPLAUSIBLE']).status).toBe('REVIEW');
  });

  it('rejects a honeypot hit whatever the rest', () => {
    expect(scoreFlags(['HONEYPOT'])).toEqual({ score: 0, status: 'REJECTED' });
  });

  it('never goes below zero', () => {
    const r = scoreFlags(['PHONE_PATTERN', 'NAME_JUNK', 'DISPOSABLE_EMAIL', 'PHONE_FLOOD']);
    expect(r.score).toBe(0);
    expect(r.status).toBe('REVIEW');
  });
});

describe('budgetFlags', () => {
  it('flags a budget under the absolute floor', () => {
    expect(budgetFlags({ transactionType: 'VENTE', budgetMax: 100_000 }, null)).toEqual([
      'BUDGET_IMPLAUSIBLE',
    ]);
    expect(budgetFlags({ transactionType: 'LOCATION', budgetMax: 100_000 }, null)).toEqual([]);
  });

  it('flags a budget far from the market median', () => {
    const median = 100_000_000;
    expect(budgetFlags({ transactionType: 'VENTE', budgetMax: 3_000_000 }, median)).toHaveLength(1);
    expect(
      budgetFlags({ transactionType: 'VENTE', budgetMin: 3_000_000_000 }, median),
    ).toHaveLength(1);
    expect(
      budgetFlags(
        { transactionType: 'VENTE', budgetMin: 80_000_000, budgetMax: 200_000_000 },
        median,
      ),
    ).toEqual([]);
  });
});

describe('assessRequestTrust', () => {
  it('trusts a plausible request', async () => {
    const r = await assessRequestTrust(prisma, good);
    expect(r).toMatchObject({ status: 'TRUSTED', score: 100, flags: [], phoneKey: '97124568' });
  });

  it('rejects when the honeypot is filled', async () => {
    const r = await assessRequestTrust(prisma, { ...good, honeypot: 'http://spam.example' });
    expect(r.status).toBe('REJECTED');
    expect(r.flags).toContain('HONEYPOT');
  });

  it('sends a fake phone number to review', async () => {
    const r = await assessRequestTrust(prisma, { ...good, clientPhone: '+229 00 00 00 00' });
    expect(r.flags).toContain('PHONE_PATTERN');
    expect(r.status).toBe('REVIEW');
    const seq = await assessRequestTrust(prisma, { ...good, clientPhone: '+229 12345678' });
    expect(seq.flags).toContain('PHONE_PATTERN');
  });

  it('flags throw-away and placeholder e-mails', async () => {
    const disposable = await assessRequestTrust(prisma, {
      ...good,
      clientEmail: 'x@mailinator.com',
    });
    expect(disposable.flags).toContain('DISPOSABLE_EMAIL');
    const placeholder = await assessRequestTrust(prisma, {
      ...good,
      clientEmail: 'test123@gmail.com',
    });
    expect(placeholder.flags).toContain('EMAIL_PATTERN');
    const example = await assessRequestTrust(prisma, { ...good, clientEmail: 'awa@example.com' });
    expect(example.flags).toContain('EMAIL_PATTERN');
  });

  it('flags junk and single-word names', async () => {
    expect(
      (await assessRequestTrust(prisma, { ...good, clientName: 'test test' })).flags,
    ).toContain('NAME_JUNK');
    expect((await assessRequestTrust(prisma, { ...good, clientName: 'aaaaa' })).flags).toContain(
      'NAME_JUNK',
    );
    expect((await assessRequestTrust(prisma, { ...good, clientName: 'Kofi' })).flags).toEqual([
      'NAME_SINGLE',
    ]);
  });

  it('uses the market median of comparable listings when there are enough', async () => {
    prismaMock.listing.findMany.mockResolvedValue(
      [100, 110, 120, 130, 140].map((m) => ({ price: m * 1_000_000 })) as never,
    );
    const r = await assessRequestTrust(prisma, {
      ...good,
      budgetMin: 1_000_000,
      budgetMax: 3_000_000,
    });
    expect(r.flags).toContain('BUDGET_IMPLAUSIBLE');
  });

  it('ignores the market when fewer than 5 comparable listings exist', async () => {
    prismaMock.listing.findMany.mockResolvedValue([{ price: 50_000_000 }] as never);
    const r = await assessRequestTrust(prisma, {
      ...good,
      budgetMin: 80_000_000,
      budgetMax: 200_000_000,
    });
    expect(r.flags).toEqual([]);
  });

  it('flags a flood from the same phone, and a repeated identical search', async () => {
    prismaMock.propertyRequest.count
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(0 as never);
    expect((await assessRequestTrust(prisma, good)).flags).toContain('PHONE_FLOOD');

    prismaMock.propertyRequest.count
      .mockResolvedValueOnce(0 as never)
      .mockResolvedValueOnce(1 as never);
    expect((await assessRequestTrust(prisma, good)).flags).toContain('DUPLICATE');
  });

  it('still answers when the database checks fail', async () => {
    prismaMock.listing.findMany.mockRejectedValue(new Error('db down') as never);
    const r = await assessRequestTrust(prisma, good);
    expect(r.status).toBe('TRUSTED');
  });
});

describe('phoneKeyOf', () => {
  it('keeps the last 8 digits, ignoring spaces and dial code', () => {
    expect(phoneKeyOf('+229 97 12 45 68')).toBe('97124568');
    expect(phoneKeyOf('0197124568')).toBe('97124568');
    expect(phoneKeyOf('123')).toBeNull();
  });
});
