// Minimal parser for phpMyAdmin MySQL dumps: extracts the rows of every
// `INSERT INTO \`table\` (cols) VALUES (...), (...);` statement. Only what the
// legacy import needs — no CREATE TABLE parsing, no hex/binary literals.

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' };

function truncated(): never {
  throw new Error('parseDump: truncated dump (unterminated INSERT)');
}

function skipWs(s: string, i: number): number {
  while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t')) i++;
  return i;
}

function readString(s: string, start: number): { value: string; end: number } {
  let i = start;
  let v = '';
  for (;;) {
    if (i >= s.length) truncated();
    const c = s[i] as string;
    if (c === '\\') {
      const n = s[i + 1] ?? truncated();
      v += ESCAPES[n] ?? n;
      i += 2;
    } else if (c === "'") {
      if (s[i + 1] === "'") {
        v += "'";
        i += 2;
      } else {
        return { value: v, end: i + 1 };
      }
    } else {
      v += c;
      i++;
    }
  }
}

function readValues(s: string, start: number, cols: string[]): { rows: SqlRow[]; end: number } {
  const rows: SqlRow[] = [];
  let i = start;
  for (;;) {
    i = skipWs(s, i);
    if (s[i] !== '(') truncated();
    i++;
    const values: SqlValue[] = [];
    for (;;) {
      i = skipWs(s, i);
      if (i >= s.length) truncated();
      if (s[i] === "'") {
        const { value, end } = readString(s, i + 1);
        values.push(value);
        i = end;
      } else {
        let j = i;
        while (j < s.length && s[j] !== ',' && s[j] !== ')') j++;
        if (j >= s.length) truncated();
        const raw = s.slice(i, j).trim();
        values.push(raw === 'NULL' ? null : Number(raw));
        i = j;
      }
      i = skipWs(s, i);
      if (s[i] === ',') {
        i++;
        continue;
      }
      if (s[i] === ')') {
        i++;
        break;
      }
      truncated();
    }
    rows.push(Object.fromEntries(cols.map((c, k) => [c, values[k] ?? null])));
    i = skipWs(s, i);
    if (s[i] === ',') {
      i++;
      continue;
    }
    if (s[i] === ';') return { rows, end: i + 1 };
    truncated();
  }
}

export function parseDump(sql: string, only?: ReadonlySet<string>): Record<string, SqlRow[]> {
  const out: Record<string, SqlRow[]> = {};
  const re = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1] as string;
    const cols = (m[2] as string).split(',').map((c) => c.trim().replace(/`/g, ''));
    const { rows, end } = readValues(sql, re.lastIndex, cols);
    re.lastIndex = end;
    if (only && !only.has(table)) continue;
    (out[table] ??= []).push(...rows);
  }
  return out;
}
