import { describe, expect, it } from 'vitest';
import {
  DISMISS_COOLDOWN_DAYS,
  SUBMIT_COOLDOWN_DAYS,
  canShowPrompt,
  canShowTimerPrompt,
  markTimerPromptShown,
  TIMER_PROMPT_COOLDOWN_HOURS,
  markPromptDismissed,
  markPromptShown,
  markPromptSubmitted,
  hasContactedListing,
  isExitIntent,
  markListingContacted,
  recordListingView,
  type PromptStorage,
} from './request-prompt';

function memoryStorage(): PromptStorage {
  const make = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  return { session: make(), local: make() };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('request prompt display rules', () => {
  it('shows for a fresh visitor', () => {
    expect(canShowPrompt(memoryStorage(), NOW)).toBe(true);
  });

  it('never shows twice in the same session, whatever the trigger', () => {
    const s = memoryStorage();
    markPromptShown(s);
    expect(canShowPrompt(s, NOW)).toBe(false);
  });

  it('stays hidden during the dismiss cooldown, then comes back', () => {
    const s = memoryStorage();
    markPromptDismissed(s, NOW);
    expect(canShowPrompt(s, NOW + (DISMISS_COOLDOWN_DAYS - 1) * DAY)).toBe(false);
    expect(canShowPrompt(s, NOW + (DISMISS_COOLDOWN_DAYS + 1) * DAY)).toBe(true);
  });

  it('stays hidden longer after the visitor started a request', () => {
    const s = memoryStorage();
    markPromptSubmitted(s, NOW);
    expect(canShowPrompt(s, NOW + (SUBMIT_COOLDOWN_DAYS - 1) * DAY)).toBe(false);
    expect(canShowPrompt(s, NOW + (SUBMIT_COOLDOWN_DAYS + 1) * DAY)).toBe(true);
  });

  it('never shows when storage is unavailable', () => {
    expect(canShowPrompt(null, NOW)).toBe(false);
  });

  it('never shows (and does not throw) when storage throws', () => {
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const s: PromptStorage = { session: boom, local: boom };
    expect(canShowPrompt(s, NOW)).toBe(false);
    expect(() => markPromptShown(s)).not.toThrow();
  });

  it('ignores corrupted timestamps', () => {
    const s = memoryStorage();
    s.local.setItem('ha:request-prompt:dismissed-at', 'not-a-number');
    expect(canShowPrompt(s, NOW)).toBe(true);
  });
});

describe('listing views tracking', () => {
  it('counts distinct listings only', () => {
    const s = memoryStorage();
    expect(recordListingView('a', s)).toBe(1);
    expect(recordListingView('a', s)).toBe(1);
    expect(recordListingView('b', s)).toBe(2);
    expect(recordListingView('c', s)).toBe(3);
  });

  it('survives corrupted storage and unavailable storage', () => {
    const s = memoryStorage();
    s.session.setItem('ha:request-prompt:viewed-listings', '{oops');
    expect(recordListingView('a', s)).toBe(1);
    expect(recordListingView('a', null)).toBe(0);
  });

  it('remembers that the visitor contacted an agent', () => {
    const s = memoryStorage();
    expect(hasContactedListing(s)).toBe(false);
    markListingContacted(s);
    expect(hasContactedListing(s)).toBe(true);
    expect(hasContactedListing(null)).toBe(false);
  });
});

describe('isExitIntent', () => {
  it('fires when the pointer leaves through the top of the window', () => {
    expect(isExitIntent({ clientY: 0, relatedTarget: null })).toBe(true);
    expect(isExitIntent({ clientY: -4, relatedTarget: null })).toBe(true);
  });
  it('ignores leaving through the sides or bottom, or moving between elements', () => {
    expect(isExitIntent({ clientY: 300, relatedTarget: null })).toBe(false);
    expect(isExitIntent({ clientY: 0, relatedTarget: {} })).toBe(false);
  });
});

describe('home timer prompt (once a day)', () => {
  const HOUR = 60 * 60 * 1000;

  it('shows for a fresh visitor, then not again for 24 hours', () => {
    const s = memoryStorage();
    expect(canShowTimerPrompt(s, NOW)).toBe(true);
    markTimerPromptShown(s, NOW);
    expect(canShowTimerPrompt(s, NOW + 1000)).toBe(false);
    expect(canShowTimerPrompt(s, NOW + (TIMER_PROMPT_COOLDOWN_HOURS - 1) * HOUR)).toBe(false);
    expect(canShowTimerPrompt(s, NOW + (TIMER_PROMPT_COOLDOWN_HOURS + 1) * HOUR)).toBe(true);
  });

  it('ignores the session flag and the dismiss cooldown', () => {
    const s = memoryStorage();
    markPromptShown(s);
    markPromptDismissed(s, NOW);
    expect(canShowTimerPrompt(s, NOW + 1000)).toBe(true);
  });

  it('leaves a visitor who started a request alone', () => {
    const s = memoryStorage();
    markPromptSubmitted(s, NOW);
    expect(canShowTimerPrompt(s, NOW + 2 * 24 * HOUR)).toBe(false);
  });

  it('never shows without storage', () => {
    expect(canShowTimerPrompt(null, NOW)).toBe(false);
  });
});
