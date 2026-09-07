import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

interface Row {
  id: string;
  title: string;
  price: number;
  note: string | null;
}

const columns = [
  { header: 'id', value: (r: Row) => r.id },
  { header: 'title', value: (r: Row) => r.title },
  { header: 'price', value: (r: Row) => r.price },
  { header: 'note', value: (r: Row) => r.note },
] as const;

describe('toCsv', () => {
  it('prepends a UTF-8 BOM and a header row', () => {
    const out = toCsv([], columns);
    expect(out).toBe('﻿id,title,price,note\r\n');
  });

  it('emits one CRLF-terminated line per row', () => {
    const out = toCsv([{ id: 'a1', title: 'Villa', price: 1000, note: null }], columns);
    expect(out).toBe('﻿id,title,price,note\r\na1,Villa,1000,\r\n');
  });

  it('quotes fields containing comma, quote or newline and doubles inner quotes', () => {
    const out = toCsv(
      [{ id: 'a2', title: 'Villa, "premium"\nCocody', price: 2000, note: 'ok' }],
      columns,
    );
    expect(out).toContain('a2,"Villa, ""premium""\nCocody",2000,ok\r\n');
  });

  it('renders null and undefined as empty strings', () => {
    const out = toCsv([{ id: 'a3', title: 'x', price: 0, note: null }], columns);
    expect(out.endsWith('a3,x,0,\r\n')).toBe(true);
  });
});
