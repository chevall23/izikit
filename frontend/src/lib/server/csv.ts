// Minimal RFC-4180-flavoured CSV serializer for admin exports.
// Prepends a UTF-8 BOM so Excel opens accented data correctly.
import 'server-only';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const NEEDS_QUOTING = /[",\n\r]/;

function escapeField(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeField(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeField(c.value(row))).join(','))
    .join('\r\n');
  const lines = body.length > 0 ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
  // eslint-disable-next-line no-irregular-whitespace
  return `﻿${lines}`;
}
