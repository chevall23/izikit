import { describe, it, expect } from 'vitest';
import {
  composePhone,
  dialFor,
  filterDialCountries,
  DIAL_COUNTRIES,
  parsePhoneValue,
} from './dial-countries';

describe('DIAL_COUNTRIES', () => {
  it('covers the whole world, one entry per country, markets first', () => {
    expect(DIAL_COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(new Set(DIAL_COUNTRIES.map((c) => c.code)).size).toBe(DIAL_COUNTRIES.length);
    expect(DIAL_COUNTRIES.slice(0, 4).map((c) => c.code)).toEqual(['BJ', 'TG', 'CI', 'SN']);
    expect(DIAL_COUNTRIES.every((c) => /^\+\d{1,4}$/.test(c.dial) && c.name.length > 1)).toBe(true);
  });

  it('knows common calling codes outside Africa', () => {
    expect(dialFor('US')).toBe('+1');
    expect(dialFor('GB')).toBe('+44');
    expect(dialFor('CN')).toBe('+86');
    expect(dialFor('MA')).toBe('+212');
    expect(dialFor('NG')).toBe('+234');
  });

  it('has a flag file for every country', async () => {
    const { existsSync } = await import('node:fs');
    const missing = DIAL_COUNTRIES.filter(
      (c) => !existsSync(`public/flags/${c.code.toLowerCase()}.svg`),
    );
    expect(missing).toEqual([]);
  });
});

describe('parsePhoneValue', () => {
  it('splits a known dial prefix from the local part', () => {
    expect(parsePhoneValue('+228 90 12 34 56', 'BJ')).toEqual({
      code: 'TG',
      local: '90 12 34 56',
    });
  });

  it('keeps a trailing space so the user can keep typing groups', () => {
    expect(parsePhoneValue('+229 01 46 ', 'BJ').local).toBe('01 46 ');
  });

  it('accepts a prefix glued to the number (signup stored format)', () => {
    expect(parsePhoneValue('+2290146070107', 'TG')).toEqual({ code: 'BJ', local: '0146070107' });
  });

  it('falls back to the given country for an empty or prefix-less value', () => {
    expect(parsePhoneValue('', 'CI')).toEqual({ code: 'CI', local: '' });
    expect(parsePhoneValue('97 12 34 56', 'BJ')).toEqual({ code: 'BJ', local: '97 12 34 56' });
  });

  it('reads a shared calling code as its main country', () => {
    expect(parsePhoneValue('+1 555 0100', 'BJ')).toEqual({ code: 'US', local: '555 0100' });
    expect(parsePhoneValue('+44 20 7946 0958', 'BJ').code).toBe('GB');
    expect(parsePhoneValue('+7 495 123 45 67', 'BJ').code).toBe('RU');
  });

  it('leaves an unknown prefix in the local part', () => {
    expect(parsePhoneValue('+999 1234', 'BJ')).toEqual({ code: 'BJ', local: '+999 1234' });
  });
});

describe('composePhone', () => {
  it('prefixes the local number with the dial code', () => {
    expect(composePhone('+229', '01 46 07 01 07')).toBe('+229 01 46 07 01 07');
  });

  it('returns an empty string when no number is typed', () => {
    expect(composePhone('+229', '   ')).toBe('');
  });

  it('keeps a number the user typed with its own + prefix', () => {
    expect(composePhone('+229', '+1 555 0100')).toBe('+1 555 0100');
  });
});

describe('filterDialCountries', () => {
  it('returns everything for an empty query', () => {
    expect(filterDialCountries('  ')).toHaveLength(DIAL_COUNTRIES.length);
  });

  it('finds a country by name, ignoring case', () => {
    expect(filterDialCountries('alleMAGne').map((c) => c.code)).toContain('DE');
  });

  it('finds countries by calling code with or without the plus', () => {
    expect(filterDialCountries('+33').map((c) => c.code)).toContain('FR');
    expect(filterDialCountries('33').map((c) => c.code)).toContain('FR');
  });

  it('finds a country by ISO code and returns nothing for nonsense', () => {
    expect(filterDialCountries('us').map((c) => c.code)).toContain('US');
    expect(filterDialCountries('zzzzzz')).toEqual([]);
  });
});
