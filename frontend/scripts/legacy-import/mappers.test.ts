import { describe, expect, it } from 'vitest';
import {
  mapPropertyType,
  mapRequestTransaction,
  mapTransactionType,
  normalizeEmail,
  normalizePhone,
  parseLegacyDate,
  parsePrice,
} from './mappers';

describe('parsePrice', () => {
  it.each([
    ['150000', 150000],
    [' 150 000 ', 150000],
    ['1.500.000', 1500000],
    ['1,500,000', 1500000],
    [400000000, 400000000],
  ] as const)('%s → %s', (raw, out) => expect(parsePrice(raw)).toBe(out));

  it.each(['', '0', '2.02', 'null', 'à débattre', null, '-5'])('%s → null', (raw) =>
    expect(parsePrice(raw)).toBeNull(),
  );
});

describe('normalizePhone', () => {
  it('keeps numbers already carrying a known dial code', () =>
    expect(normalizePhone('22966969961')).toBe('+22966969961'));

  it('honours + and 00 prefixes', () => {
    expect(normalizePhone('+33 7 45 54 86 95')).toBe('+33745548695');
    expect(normalizePhone('0022890112233')).toBe('+22890112233');
  });

  it('prefixes local numbers with the agent country dial', () =>
    expect(normalizePhone('90 11 22 33', '228')).toBe('+22890112233'));

  it('returns null for junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('90112233')).toBeNull(); // local, no country known
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () =>
    expect(normalizeEmail(' Roger.Sogan@Gmail.com ')).toBe('roger.sogan@gmail.com'));

  it.each(['c:/', '', 'foo@bar', 'a b@c.com', null])('rejects %s', (raw) =>
    expect(normalizeEmail(raw)).toBeNull(),
  );
});

describe('parseLegacyDate', () => {
  it('reads datetimes as Africa/Porto-Novo (UTC+1)', () =>
    expect(parseLegacyDate('2025-05-16 07:42:49')?.toISOString()).toBe('2025-05-16T06:42:49.000Z'));

  it('reads plain dates', () =>
    expect(parseLegacyDate('2022-10-26')?.toISOString()).toBe('2022-10-25T23:00:00.000Z'));

  it.each(['0000-00-00 00:00:00', '', null, 'n/a'])('rejects %s', (raw) =>
    expect(parseLegacyDate(raw)).toBeNull(),
  );
});

describe('type mappings', () => {
  it('maps legacy property type ids', () => {
    expect(mapPropertyType(1)).toBe('VILLA');
    expect(mapPropertyType(3)).toBe('BOUTIQUE'); // ENTREPOT
    expect(mapPropertyType(12)).toBe('MAISON'); // DUPLEX
    expect(mapPropertyType(13)).toBe('PARCELLE');
    expect(mapPropertyType(15)).toBe('DOMAINE'); // ECOLODGE
    expect(mapPropertyType(0)).toBeNull();
  });

  it('maps transaction types case-insensitively', () => {
    expect(mapTransactionType('Vente')).toBe('VENTE');
    expect(mapTransactionType('location')).toBe('LOCATION');
    expect(mapTransactionType('vacance')).toBe('SEJOUR');
    expect(mapTransactionType('auberge')).toBe('AUBERGE');
    expect(mapTransactionType('undefined')).toBeNull();
  });

  it('maps public request actions', () => {
    expect(mapRequestTransaction('louer')).toBe('LOCATION');
    expect(mapRequestTransaction('acheter')).toBe('VENTE');
    expect(mapRequestTransaction('sejourner')).toBe('SEJOUR');
    expect(mapRequestTransaction('???')).toBeNull();
  });
});
