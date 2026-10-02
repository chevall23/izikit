import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderEmail } from './layout';

afterEach(() => vi.unstubAllEnvs());

describe('renderEmail', () => {
  it('escapes every interpolated value in the HTML', () => {
    const t = renderEmail({
      subject: 'Sujet',
      preheader: 'Aperçu',
      greetingName: '<b>Kofi</b>',
      paragraphs: ['Texte <script>alert(1)</script>'],
      details: [{ label: 'Nom', value: '"><img src=x>' }],
      quote: '<a href="https://evil.example">clique</a>',
    });
    expect(t.html).not.toContain('<script>');
    expect(t.html).not.toContain('<b>Kofi</b>');
    expect(t.html).not.toContain('<img src=x>');
    expect(t.html).not.toContain('<a href="https://evil.example">');
    expect(t.html).toContain('&lt;b&gt;Kofi&lt;/b&gt;');
  });

  it('builds a French plain-text version with greeting, code, details, link and signature', () => {
    vi.stubEnv('APP_URL', 'https://habitat-afrik.com/');
    const t = renderEmail({
      subject: 'Sujet',
      preheader: 'Aperçu',
      greetingName: 'Kofi',
      paragraphs: ['Premier paragraphe.'],
      code: 'ABCD2345',
      details: [{ label: 'Téléphone', value: '+229 01 00 00 00' }],
      button: { label: 'Ouvrir', path: '/contacts' },
    });
    expect(t.text).toContain('Bonjour Kofi,');
    expect(t.text).toContain('ABCD2345');
    expect(t.text).toContain('Téléphone : +229 01 00 00 00');
    expect(t.text).toContain('Ouvrir : https://habitat-afrik.com/contacts');
    expect(t.text).toContain("L'équipe Habitat Afrik");
    expect(t.html).toContain('href="https://habitat-afrik.com/contacts"');
    expect(t.html).toContain('src="https://habitat-afrik.com/logo.png"');
  });

  it('says "Bonjour," without a name and omits the button when APP_URL is unset', () => {
    vi.stubEnv('APP_URL', '');
    const t = renderEmail({
      subject: 'Sujet',
      preheader: 'Aperçu',
      paragraphs: ['Texte.'],
      button: { label: 'Ouvrir', path: '/contacts' },
    });
    expect(t.text).toContain('Bonjour,');
    expect(t.html).not.toContain('href="/contacts"');
    expect(t.text).not.toContain('Ouvrir :');
  });
});
