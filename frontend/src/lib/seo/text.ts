// Text helpers for meta descriptions built from user-entered content.

const PHONE_RE = /\+?\d[\d\s.()-]{6,}\d/g;

/** Collapse whitespace and drop phone numbers (agents paste them everywhere). */
export function cleanText(text: string): string {
  return text.replace(PHONE_RE, '').replace(/\s+/g, ' ').trim();
}

/** Cut at a word boundary, ending with "…", never above `max` characters. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,.;:–—-]+$/, '')}…`;
}
