// Display rules for the "déposez une demande" prompt (modal on desktop,
// bottom sheet on mobile). Pure and storage-injected so the rules are
// testable; the component owns the timers and the DOM.
//
// Rules (Google penalises intrusive interstitials, and a request filled in
// only to dismiss the prompt is a low-quality lead):
//   - at most once per browsing session, whatever the trigger;
//   - not again for DISMISS_COOLDOWN_DAYS after the visitor closed it;
//   - not again for SUBMIT_COOLDOWN_DAYS after the visitor started a request.
// Exception (product decision): the 'timer' trigger on the home page has its own
// rule — once per TIMER_PROMPT_COOLDOWN_HOURS, whatever the session, and not
// dismiss-limited — see canShowTimerPrompt.

export type PromptTrigger = 'timer' | 'empty-search' | 'listings-viewed' | 'exit-intent';

export const PROMPT_TIMER_DELAY_MS = 60_000;
export const PROMPT_EMPTY_SEARCH_DELAY_MS = 1_500;
// Third listing page of the session: wait a little so it never lands on arrival.
export const PROMPT_LISTINGS_VIEWED_DELAY_MS = 8_000;
export const LISTINGS_VIEWED_THRESHOLD = 3;
// Exit intent is only listened to after this long on the page.
export const EXIT_INTENT_MIN_TIME_MS = 10_000;
export const TIMER_PROMPT_COOLDOWN_HOURS = 24;
export const DISMISS_COOLDOWN_DAYS = 14;
export const SUBMIT_COOLDOWN_DAYS = 30;

const SESSION_KEY = 'ha:request-prompt:shown';
const DISMISSED_KEY = 'ha:request-prompt:dismissed-at';
const SUBMITTED_KEY = 'ha:request-prompt:submitted-at';
const TIMER_SHOWN_KEY = 'ha:request-prompt:timer-shown-at';
const VIEWED_KEY = 'ha:request-prompt:viewed-listings';
const CONTACTED_KEY = 'ha:request-prompt:contacted';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromptStorage {
  session: Pick<Storage, 'getItem' | 'setItem'>;
  local: Pick<Storage, 'getItem' | 'setItem'>;
}

function browserStorage(): PromptStorage | null {
  try {
    return { session: window.sessionStorage, local: window.localStorage };
  } catch {
    return null; // private mode / blocked storage
  }
}

function recent(raw: string | null, days: number, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && now - at < days * DAY_MS;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** True when the prompt may be shown now. Without storage it never shows. */
export function canShowPrompt(
  storage: PromptStorage | null = browserStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  return safe(() => {
    if (storage.session.getItem(SESSION_KEY)) return false;
    if (recent(storage.local.getItem(DISMISSED_KEY), DISMISS_COOLDOWN_DAYS, now)) return false;
    if (recent(storage.local.getItem(SUBMITTED_KEY), SUBMIT_COOLDOWN_DAYS, now)) return false;
    return true;
  }, false);
}

/** Records that the prompt is on screen: blocks every other trigger this session. */
export function markPromptShown(storage: PromptStorage | null = browserStorage()): void {
  if (!storage) return;
  safe(() => storage.session.setItem(SESSION_KEY, '1'), undefined);
}

export function markPromptDismissed(
  storage: PromptStorage | null = browserStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;
  safe(() => storage.local.setItem(DISMISSED_KEY, String(now)), undefined);
}

export function markPromptSubmitted(
  storage: PromptStorage | null = browserStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;
  safe(() => storage.local.setItem(SUBMITTED_KEY, String(now)), undefined);
}

/**
 * Home timer prompt: at most once per TIMER_PROMPT_COOLDOWN_HOURS (counted from
 * when it was shown, so reloading within the day does not bring it back). A
 * visitor who already started a request is left alone for SUBMIT_COOLDOWN_DAYS.
 */
export function canShowTimerPrompt(
  storage: PromptStorage | null = browserStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  return safe(() => {
    const shownAt = storage.local.getItem(TIMER_SHOWN_KEY);
    if (recent(shownAt, TIMER_PROMPT_COOLDOWN_HOURS / 24, now)) return false;
    if (recent(storage.local.getItem(SUBMITTED_KEY), SUBMIT_COOLDOWN_DAYS, now)) return false;
    return true;
  }, false);
}

export function markTimerPromptShown(
  storage: PromptStorage | null = browserStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;
  safe(() => storage.local.setItem(TIMER_SHOWN_KEY, String(now)), undefined);
}

const MAX_TRACKED_VIEWS = 50;

/** Records a listing page view for this session; returns the distinct count. */
export function recordListingView(
  id: string,
  storage: PromptStorage | null = browserStorage(),
): number {
  if (!storage) return 0;
  return safe(() => {
    const raw = storage.session.getItem(VIEWED_KEY);
    let ids: string[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      ids = [];
    }
    if (!ids.includes(id)) ids = [...ids, id].slice(-MAX_TRACKED_VIEWS);
    storage.session.setItem(VIEWED_KEY, JSON.stringify(ids));
    return ids.length;
  }, 0);
}

/** The visitor reached an agent (message sent, WhatsApp or phone tapped). */
export function markListingContacted(storage: PromptStorage | null = browserStorage()): void {
  if (!storage) return;
  safe(() => storage.session.setItem(CONTACTED_KEY, '1'), undefined);
}

export function hasContactedListing(storage: PromptStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  return safe(() => storage.session.getItem(CONTACTED_KEY) === '1', false);
}

/**
 * A mouse leaving through the top edge of the window (towards the tab bar /
 * address bar / close button). relatedTarget is null when the pointer left
 * the document rather than moving to another element.
 */
export function isExitIntent(e: { clientY: number; relatedTarget: unknown }): boolean {
  return e.relatedTarget === null && e.clientY <= 0;
}
