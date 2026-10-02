import { describe, it, expect } from 'vitest';
import { verificationEmail, resetPasswordEmail } from './email-templates';

describe('verificationEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('ABCD2345');
    expect(t.text).toContain('ABCD2345');
  });

  it('has a French subject', () => {
    const t = verificationEmail({ code: 'XYZ12345', email: 'x@y.com' });
    expect(t.subject).toBe('Confirmez votre adresse e-mail');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    // floor-biased: with 15 min remaining the rendered value can be 14 or 15.
    expect(t.text).toMatch(/expire dans 1[45] minutes/);
    expect(t.html).toMatch(/expire dans 1[45] minutes/);
  });

  it('renders "dans N heures" for multi-hour TTLs', () => {
    // +1 min buffer so the floor-biased rounding can't drop to 119 minutes.
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('dans 2 heures');
  });

  it('falls back to "sous peu" when expiresAt is omitted, malformed or past', () => {
    for (const expiresAt of [
      undefined,
      'not-an-iso-date',
      new Date(Date.now() - 1000).toISOString(),
    ]) {
      const t = verificationEmail({
        code: 'ABCD2345',
        email: 'a@b.com',
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
      expect(t.text).toContain('expire sous peu');
    }
  });

  it('contains no leftover English', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.text).not.toMatch(/\b(your|code is|expires|ignore this)\b/i);
  });
});

describe('resetPasswordEmail', () => {
  it('embeds the code in both html and text', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.html).toContain('WXYZ9876');
    expect(t.text).toContain('WXYZ9876');
  });

  it('has a French subject', () => {
    const t = resetPasswordEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBe('Réinitialisation de votre mot de passe');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com', expiresAt });
    expect(t.text).toMatch(/expire dans 1[45] minutes/);
  });
});
