import { describe, expect, it } from 'vitest';
import { formatBudget } from './alerts';
import { formatBudget as formatRequestBudget } from './requests';

describe('formatBudget', () => {
  it('shows whole FCFA amounts, never "0.1M"-style decimals', () => {
    expect(formatBudget(100_000, 200_000)).toBe('100 000 – 200 000 FCFA');
    expect(formatBudget(30_000, 45_000)).toBe('30 000 – 45 000 FCFA');
    expect(formatBudget(25_000_000, 40_000_000)).toBe('25 000 000 – 40 000 000 FCFA');
  });

  it('handles open-ended and missing budgets', () => {
    expect(formatBudget(150_000, null)).toBe('À partir de 150 000 FCFA');
    expect(formatBudget(null, 80_000)).toBe("Jusqu'à 80 000 FCFA");
    expect(formatBudget(null, null)).toBe('Non précisé');
  });

  it('rounds stray fractional values to whole francs', () => {
    expect(formatBudget(99_999.6, null)).toBe('À partir de 100 000 FCFA');
  });

  it('is the same function for property requests', () => {
    expect(formatRequestBudget).toBe(formatBudget);
  });
});
