import { describe, it, expect } from 'vitest';
import { computeReadTimeMinutes } from './read-time';

describe('computeReadTimeMinutes', () => {
  it('returns 1 for empty or whitespace-only content', () => {
    expect(computeReadTimeMinutes('')).toBe(1);
    expect(computeReadTimeMinutes('<p>   </p>')).toBe(1);
  });

  it('strips HTML tags before counting words', () => {
    const html = '<p>' + 'mot '.repeat(200) + '</p>';
    expect(computeReadTimeMinutes(html)).toBe(1);
  });

  it('rounds up to the nearest minute at 200 words per minute', () => {
    const html = 'mot '.repeat(450); // 450 / 200 = 2.25 -> ceil -> 3
    expect(computeReadTimeMinutes(html)).toBe(3);
  });

  it('never returns less than 1 even for a single word', () => {
    expect(computeReadTimeMinutes('Bonjour')).toBe(1);
  });
});
