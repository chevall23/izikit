import { describe, expect, it } from 'vitest';
import {
  errorMessages,
  firstInvalidStep,
  positiveInt,
  validateStep,
  validateThrough,
  type RequestDraft,
} from './request-validation';

const valid: RequestDraft = {
  propertyType: 'VILLA',
  country: 'Bénin',
  city: 'Cotonou',
  surface: '',
  capacity: '',
  bedrooms: '3 chambres',
  salons: '1 salon',
  priority: 'Normale',
  budgetMin: '80000000',
  budgetMax: '200000000',
  financing: 'Comptant',
  delay: 'Immédiat',
  clientName: 'Aïcha Koné',
  phone: '+229 90 12 34 56',
  email: 'aicha@example.com',
  clientType: 'Particulier',
  source: 'Google',
};

describe('validateStep', () => {
  it('accepts a complete draft on every step', () => {
    for (const s of [1, 2, 3] as const) expect(validateStep(s, valid)).toEqual({});
    expect(firstInvalidStep(valid)).toBeNull();
  });

  it('step 1 requires country and city', () => {
    const e = validateStep(1, { ...valid, country: '', city: ' ' });
    expect(Object.keys(e).sort()).toEqual(['city', 'country']);
  });

  it('step 1 asks for the surface on land, not for rooms', () => {
    const land = { ...valid, propertyType: 'PARCELLE', bedrooms: '', salons: '' };
    expect(Object.keys(validateStep(1, land))).toEqual(['surface']);
    expect(validateStep(1, { ...land, surface: '600' })).toEqual({});
  });

  it('step 1 asks for the capacity on halls', () => {
    const hall = { ...valid, propertyType: 'SALLE_FETE', bedrooms: '', salons: '' };
    expect(Object.keys(validateStep(1, hall))).toEqual(['capacity']);
    expect(validateStep(1, { ...hall, capacity: '200' })).toEqual({});
  });

  it('step 1 asks for bedrooms and salons on other types', () => {
    const e = validateStep(1, { ...valid, bedrooms: '', salons: '' });
    expect(Object.keys(e).sort()).toEqual(['bedrooms', 'salons']);
  });

  it('step 2 requires both budgets, with max >= min', () => {
    expect(Object.keys(validateStep(2, { ...valid, budgetMin: '', budgetMax: '' })).sort()).toEqual(
      ['budgetMax', 'budgetMin'],
    );
    const inverted = validateStep(2, { ...valid, budgetMin: '200', budgetMax: '100' });
    expect(inverted.budgetMax).toMatch(/supérieur/);
    expect(validateStep(2, { ...valid, budgetMin: '100', budgetMax: '100' })).toEqual({});
  });

  it('step 2 rejects zero, negative and decimal budgets', () => {
    for (const bad of ['0', '-5', '1.5', 'abc']) {
      expect(validateStep(2, { ...valid, budgetMin: bad }).budgetMin).toBeDefined();
    }
  });

  it('step 3 requires name, phone, email, client type and source', () => {
    const e = validateStep(3, {
      ...valid,
      clientName: '',
      phone: '',
      email: '',
      clientType: '',
      source: '',
    });
    expect(Object.keys(e).sort()).toEqual(['clientName', 'clientType', 'email', 'phone', 'source']);
  });

  it('step 3 rejects an implausible name, phone and email', () => {
    expect(validateStep(3, { ...valid, clientName: '12345' }).clientName).toBeDefined();
    expect(validateStep(3, { ...valid, clientName: 'A' }).clientName).toBeDefined();
    expect(validateStep(3, { ...valid, phone: '+229 12' }).phone).toBeDefined();
    expect(validateStep(3, { ...valid, phone: '+229 1234567890123456' }).phone).toBeDefined();
    expect(validateStep(3, { ...valid, email: 'not-an-email' }).email).toBeDefined();
  });
});

describe('helpers', () => {
  it('validateThrough accumulates the earlier steps', () => {
    const draft = { ...valid, country: '', budgetMin: '' };
    expect(Object.keys(validateThrough(1, draft))).toEqual(['country']);
    expect(Object.keys(validateThrough(2, draft)).sort()).toEqual(['budgetMin', 'country']);
  });

  it('firstInvalidStep finds the earliest broken step', () => {
    expect(firstInvalidStep({ ...valid, budgetMax: '' })).toBe(2);
    expect(firstInvalidStep({ ...valid, country: '', email: '' })).toBe(1);
  });

  it('errorMessages lists one message per field', () => {
    expect(errorMessages({ city: 'a', country: 'b' })).toEqual(['a', 'b']);
  });

  it('positiveInt parses spaced digits only', () => {
    expect(positiveInt('80 000 000')).toBe(80_000_000);
    expect(positiveInt('')).toBeNull();
  });
});
