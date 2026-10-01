// Pure value mappers from the legacy PHP site's MySQL schema to the Prisma
// schema. No I/O. Mapping tables reflect decisions recorded in
// docs/superpowers/plans/2026-10-01-legacy-data-import.md.
import type { SqlValue } from './parse-dump';

export const COUNTRY_BY_ID: Record<number, string> = {
  1: 'Bénin',
  2: 'Togo',
  3: "Côte d'Ivoire",
  4: 'Sénégal',
};
export const COUNTRY_BY_CODE: Record<string, string> = {
  BJ: 'Bénin',
  TG: 'Togo',
  CI: "Côte d'Ivoire",
  SN: 'Sénégal',
};
export const DIAL_BY_COUNTRY: Record<string, string> = {
  Bénin: '229',
  Togo: '228',
  "Côte d'Ivoire": '225',
  Sénégal: '221',
};
const KNOWN_DIALS = Object.values(DIAL_BY_COUNTRY);

// tbltypebien.idtype → PROPERTY_TYPE_LABEL key. Types absent de la refonte :
// ENTREPOT(3)→BOUTIQUE, DUPLEX(12)→MAISON, PARCELLE sans/avec TF(8/13)→PARCELLE,
// AUBERGE(14)→MAISON (la transaction AUBERGE porte l'info), ECOLODGE(15)→DOMAINE.
const PROPERTY_TYPE_BY_ID: Record<number, string> = {
  1: 'VILLA',
  2: 'MAISON',
  3: 'BOUTIQUE',
  4: 'APPARTEMENT',
  5: 'BOUTIQUE',
  6: 'BUREAU',
  7: 'SALLE_FETE',
  8: 'PARCELLE',
  9: 'IMMEUBLE',
  10: 'DOMAINE',
  12: 'MAISON',
  13: 'PARCELLE',
  14: 'MAISON',
  15: 'DOMAINE',
  16: 'SALLE_CONFERENCE',
};

export function str(v: SqlValue | undefined): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function int(v: SqlValue | undefined): number | null {
  const n = typeof v === 'number' ? v : Number.parseInt(str(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizeEmail(raw: SqlValue | undefined): string | null {
  const e = str(raw).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export function normalizePhone(raw: SqlValue | undefined, dial?: string | null): string | null {
  const s = str(raw);
  let digits = s.replace(/\D/g, '');
  const international = s.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length >= 11 && KNOWN_DIALS.some((p) => digits.startsWith(p))) return `+${digits}`;
  if (dial && digits.length >= 8 && digits.length <= 10) return `+${dial}${digits}`;
  return null;
}

export function parsePrice(raw: SqlValue | undefined): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  const s = str(raw).replace(/\s/g, ''); // \s also covers U+00A0 (no-break space)
  if (/^\d+$/.test(s)) return int(s);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return int(s.replace(/[.,]/g, ''));
  return null;
}

export function parseLegacyDate(raw: SqlValue | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(str(raw));
  if (!m || m[1] === '0000') return null;
  const d = new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}+01:00`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapPropertyType(idtype: SqlValue | undefined): string | null {
  return PROPERTY_TYPE_BY_ID[Number(idtype)] ?? null;
}

export function mapTransactionType(
  type: SqlValue | undefined,
): 'VENTE' | 'LOCATION' | 'SEJOUR' | 'AUBERGE' | null {
  switch (str(type).toLowerCase()) {
    case 'vente':
      return 'VENTE';
    case 'location':
      return 'LOCATION';
    case 'vacance':
      return 'SEJOUR';
    case 'auberge':
      return 'AUBERGE';
    default:
      return null;
  }
}

export function mapRequestTransaction(
  action: SqlValue | undefined,
): 'VENTE' | 'LOCATION' | 'SEJOUR' | null {
  switch (str(action).toLowerCase()) {
    case 'louer':
    case 'location':
      return 'LOCATION';
    case 'acheter':
    case 'achat':
    case 'vente':
      return 'VENTE';
    case 'sejour':
    case 'sejourner':
    case 'séjour':
    case 'vacance':
      return 'SEJOUR';
    default:
      return null;
  }
}
