import { describe, expect, it } from 'vitest';
import { parseDump } from './parse-dump';

const SQL = `
CREATE TABLE \`tblpays\` (\`idpays\` int(11) NOT NULL);
INSERT INTO \`tblpays\` (\`idpays\`, \`pays\`, \`logo\`) VALUES
(1, 'benin', NULL),
(2, 'côte d\\'ivoire', 'ci.png');
INSERT INTO \`tblannonce\` (\`idannonce\`, \`description\`, \`prix\`) VALUES
(10, 'Ligne 1\\r\\nLigne 2 ); piège', '150000'),
(11, 'It''s ok, (vraiment)', '-1');
INSERT INTO \`tblpays\` (\`idpays\`, \`pays\`, \`logo\`) VALUES
(3, 'togo', '');
`;

describe('parseDump', () => {
  it('parses every INSERT and merges multiple INSERTs of the same table', () => {
    const d = parseDump(SQL);
    expect(d.tblpays).toEqual([
      { idpays: 1, pays: 'benin', logo: null },
      { idpays: 2, pays: "côte d'ivoire", logo: 'ci.png' },
      { idpays: 3, pays: 'togo', logo: '' },
    ]);
  });

  it('handles backslash escapes, doubled quotes and ");" inside strings', () => {
    const d = parseDump(SQL);
    expect(d.tblannonce?.[0]).toEqual({
      idannonce: 10,
      description: 'Ligne 1\r\nLigne 2 ); piège',
      prix: '150000',
    });
    expect(d.tblannonce?.[1]?.description).toBe("It's ok, (vraiment)");
  });

  it('keeps only the requested tables when `only` is given', () => {
    const d = parseDump(SQL, new Set(['tblannonce']));
    expect(Object.keys(d)).toEqual(['tblannonce']);
  });

  it('throws on a truncated dump instead of looping forever', () => {
    expect(() => parseDump("INSERT INTO `t` (`a`) VALUES\n(1, 'oops")).toThrow(/truncated/i);
  });
});
