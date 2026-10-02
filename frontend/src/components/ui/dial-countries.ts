import type { FlagCode } from './CountryFlag';

export interface DialCountry {
  code: FlagCode;
  name: string;
  dial: string;
}

// The four markets come first, then common neighbours / diaspora.
export const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'BJ', name: 'Bénin', dial: '+229' },
  { code: 'TG', name: 'Togo', dial: '+228' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225' },
  { code: 'SN', name: 'Sénégal', dial: '+221' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226' },
  { code: 'ML', name: 'Mali', dial: '+223' },
  { code: 'GN', name: 'Guinée', dial: '+224' },
  { code: 'FR', name: 'France', dial: '+33' },
];

// Longest dial first so "+2290…" can never be read as a shorter code.
const BY_DIAL_LENGTH = [...DIAL_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function dialFor(code: FlagCode): string {
  return DIAL_COUNTRIES.find((c) => c.code === code)?.dial ?? '+229';
}

/**
 * Splits a full phone value ("+228 90 12 34 56", "+2290146070107") into its
 * dial country and the local part. Unlike `splitPhone`, the local part is not
 * trimmed at the end, so a space typed between digit groups survives the
 * controlled round-trip.
 */
export function parsePhoneValue(
  value: string,
  fallback: FlagCode,
): { code: FlagCode; local: string } {
  const match = value.startsWith('+') ? BY_DIAL_LENGTH.find((c) => value.startsWith(c.dial)) : null;
  if (!match) return { code: fallback, local: value };
  return { code: match.code, local: value.slice(match.dial.length).replace(/^\s+/, '') };
}

/** Full value for the form: "" when nothing is typed, as-is when the user typed their own "+…". */
export function composePhone(dial: string, local: string): string {
  if (!local.trim()) return '';
  if (local.trimStart().startsWith('+')) return local.trim();
  return `${dial} ${local}`;
}
