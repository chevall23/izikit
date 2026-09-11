// Deterministic read-time estimate for a BlogArticle — computed server-side
// so the admin never has to guess/enter it manually. Strips HTML tags,
// counts whitespace-separated words, divides by 200 wpm, rounds up,
// floors at 1 minute.
const WORDS_PER_MINUTE = 200;

export function computeReadTimeMinutes(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return 1;
  const wordCount = text.split(' ').length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}
