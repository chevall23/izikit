import { describe, it, expect } from 'vitest';
import { composePhone, parsePhoneValue } from './dial-countries';

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

  it('leaves an unknown international prefix in the local part', () => {
    expect(parsePhoneValue('+1 555 0100', 'BJ')).toEqual({ code: 'BJ', local: '+1 555 0100' });
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
