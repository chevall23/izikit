import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml } from './sanitize';

describe('sanitizeArticleHtml', () => {
  it('keeps whitelisted formatting tags', () => {
    const input = '<p>Bonjour <strong>le monde</strong> et <em>vous</em>.</p>';
    expect(sanitizeArticleHtml(input)).toBe(input);
  });

  it('strips script tags entirely, including their content', () => {
    const input = '<p>Texte</p><script>alert("xss")</script>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Texte</p>');
  });

  it('strips on* event handler attributes', () => {
    const input = '<p onclick="alert(1)">Texte</p>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Texte</p>');
  });

  it('strips disallowed tags like iframe and style but keeps their text', () => {
    const input = '<iframe src="https://evil.example"></iframe><p>Safe</p>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Safe</p>');
  });

  it('keeps safe links and forces rel="noopener noreferrer"', () => {
    const input = '<a href="https://example.com" target="_blank">Lien</a>';
    const out = sanitizeArticleHtml(input);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('drops javascript: URLs from links', () => {
    const input = '<a href="javascript:alert(1)">Clique</a>';
    const out = sanitizeArticleHtml(input);
    expect(out).not.toContain('javascript:');
  });

  it('keeps images with src and alt', () => {
    const input = '<img src="https://example.com/photo.jpg" alt="Photo" />';
    const out = sanitizeArticleHtml(input);
    expect(out).toContain('src="https://example.com/photo.jpg"');
    expect(out).toContain('alt="Photo"');
  });
});
