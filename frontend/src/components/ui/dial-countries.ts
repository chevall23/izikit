import { DIAL_COUNTRIES, type DialCountry, type FlagCode } from './country-data';

export { DIAL_COUNTRIES, type DialCountry, type FlagCode };

// Several countries share a calling code (+1, +7, +44…): reading a stored
// "+1 …" back picks the main one of the group.
const MAIN_FOR_SHARED_DIAL: FlagCode[] = [
  'US',
  'RU',
  'GB',
  'AU',
  'IT',
  'FI',
  'GP',
  'CW',
  'RE',
  'MA',
  'NO',
  'SH',
];

// Longest dial first so "+2290…" can never be read as a shorter code.
export const BY_DIAL_LENGTH = [...DIAL_COUNTRIES].sort(
  (a, b) =>
    b.dial.length - a.dial.length ||
    Number(MAIN_FOR_SHARED_DIAL.includes(b.code)) - Number(MAIN_FOR_SHARED_DIAL.includes(a.code)),
);

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

/** Dropdown search: by country name, by calling code ("+33", "33") or by ISO code ("fr"). */
export function filterDialCountries(query: string): DialCountry[] {
  const needle = query.trim().toLowerCase().replace(/^\+/, '');
  if (!needle) return DIAL_COUNTRIES;
  return DIAL_COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      c.dial.slice(1).startsWith(needle) ||
      c.code.toLowerCase() === needle,
  );
}
