import { describe, it, expect } from 'vitest';
import { buildStatsCsv, csvCell } from './csv';

describe('csvCell', () => {
  it('leaves plain values alone and renders null as empty', () => {
    expect(csvCell('Villa')).toBe('Villa');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells containing ; " or a line break, doubling the quotes', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+33')).toBe("'+33");
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
  });

  it('does not touch a negative number given as a number', () => {
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('buildStatsCsv', () => {
  const csv = buildStatsCsv({
    period: '30j',
    kpis: [
      { label: 'Vues', value: 120, trendPct: 10 },
      { label: 'Taux de conversion (%)', value: 2.5, trendPct: -4 },
    ],
    viewsByDay: [
      { date: '2026-11-09', count: 3 },
      { date: '2026-11-10', count: 0 },
    ],
    listings: [
      {
        title: 'Villa; "vue mer"',
        city: 'Cotonou',
        country: 'Bénin',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        status: 'VERIFIED',
        price: 50_000_000,
        currency: 'XOF',
        views: 7,
        contacts: 2,
      },
    ],
  });

  it('starts with a UTF-8 BOM and uses CRLF line ends', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('has the three sections separated by a blank line', () => {
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Indicateurs (période : 30j)');
    expect(lines).toContain('Vues par jour');
    expect(lines).toContain('Détail par annonce');
    expect(lines.filter((l) => l === '')).toHaveLength(3); // 2 separators + trailing
  });

  it('writes the indicators with their variation', () => {
    expect(csv).toContain(
      'Indicateur;Valeur;Variation (%)\r\nVues;120;10\r\nTaux de conversion (%);2.5;-4',
    );
  });

  it('writes one row per day and one per listing, escaped', () => {
    expect(csv).toContain('2026-11-09;3\r\n2026-11-10;0');
    expect(csv).toContain(
      '"Villa; ""vue mer""";Cotonou;Bénin;VILLA;VENTE;VERIFIED;50000000;XOF;7;2',
    );
  });

  it('is still valid with no listings and no views', () => {
    const empty = buildStatsCsv({ period: '7j', kpis: [], viewsByDay: [], listings: [] });
    expect(empty).toContain('Détail par annonce');
    expect(empty).toContain(
      'Titre;Ville;Pays;Type de bien;Transaction;Statut;Prix;Devise;Vues;Contacts',
    );
  });
});
