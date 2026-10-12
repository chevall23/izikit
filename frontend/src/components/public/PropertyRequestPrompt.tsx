'use client';

// "Déposez une demande" prompt: a centred modal on desktop, a bottom sheet on
// mobile. It never opens on arrival — it is armed by a behavioural trigger
// (see lib/request-prompt.ts for the display rules and the trigger delays):
//   - 'timer'        : the visitor has been on the page for a while;
//   - 'empty-search' : the visitor searched and nothing matched.
// The form is the same sentence + WhatsApp number as the home "Vous ne
// trouvez pas ?" section and hands over to the full request wizard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  PERKS,
  PropertyRequestForm,
  type PropertyRequestTeaserDefaults,
} from '@/components/public/PropertyRequestTeaser';
import {
  EXIT_INTENT_MIN_TIME_MS,
  PROMPT_EMPTY_SEARCH_DELAY_MS,
  PROMPT_LISTINGS_VIEWED_DELAY_MS,
  PROMPT_TIMER_DELAY_MS,
  canShowPrompt,
  canShowTimerPrompt,
  markTimerPromptShown,
  isExitIntent,
  markPromptDismissed,
  markPromptShown,
  markPromptSubmitted,
  type PromptTrigger,
} from '@/lib/request-prompt';

const COPY: Record<PromptTrigger, { title: string; text: string }> = {
  timer: {
    title: 'Dites-nous ce que vous cherchez',
    text: 'Les agents certifiés de votre ville vous proposent des biens correspondants, directement sur WhatsApp.',
  },
  'empty-search': {
    title: 'Aucune annonce ne correspond… pour l’instant',
    text: 'Laissez votre demande : les agents certifiés vous contactent dès qu’un bien correspond à votre recherche.',
  },
  'listings-viewed': {
    title: 'Vous comparez plusieurs biens ?',
    text: 'Dites-nous ce qui compte pour vous : les agents certifiés vous proposent des biens qui correspondent, sans que vous ayez à tout parcourir.',
  },
  'exit-intent': {
    title: 'Avant de partir…',
    text: 'Vous n’avez pas trouvé le bien idéal ? Laissez votre demande en 30 secondes : les agents viennent à vous.',
  },
};

// Delay before opening once armed. Exit intent has none: it is event-driven.
const DELAY_MS: Record<PromptTrigger, number> = {
  timer: PROMPT_TIMER_DELAY_MS,
  'empty-search': PROMPT_EMPTY_SEARCH_DELAY_MS,
  'listings-viewed': PROMPT_LISTINGS_VIEWED_DELAY_MS,
  'exit-intent': 0,
};

// Retry delay when the visitor is typing in a field at the moment we'd open.
const BUSY_RETRY_MS = 5_000;

// The home page timer prompt has its own rule (once a day, see
// canShowTimerPrompt) instead of the session / dismiss rules that govern the
// other triggers. It also never stacks on top of a prompt that is already open.
function mayOpen(trigger: PromptTrigger): boolean {
  if (trigger !== 'timer') return canShowPrompt();
  if (!canShowTimerPrompt()) return false;
  return !document.querySelector('[role="dialog"][aria-labelledby="request-prompt-title"]');
}

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.hasAttribute('contenteditable')
  );
}

export function PropertyRequestPrompt({
  trigger,
  armed = true,
  defaults = {},
}: {
  trigger: PromptTrigger;
  /** The prompt only counts down while armed; disarming cancels the countdown. */
  armed?: boolean;
  defaults?: PropertyRequestTeaserDefaults;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Countdown. Only runs while the tab is visible and the visitor is not
  // typing; the display rules are re-checked at the moment of opening.
  useEffect(() => {
    if (!armed || open || trigger === 'exit-intent') return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tryOpen = () => {
      timer = undefined;
      if (document.hidden) return; // resumed by the visibilitychange listener
      if (isTyping()) {
        timer = setTimeout(tryOpen, BUSY_RETRY_MS);
        return;
      }
      if (!mayOpen(trigger)) return;
      if (trigger === 'timer') markTimerPromptShown();
      markPromptShown();
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };

    const onVisibility = () => {
      if (!document.hidden && !timer) timer = setTimeout(tryOpen, 0);
    };

    if (!mayOpen(trigger)) return;
    timer = setTimeout(tryOpen, DELAY_MS[trigger]);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armed, open, trigger]);

  // Exit intent (desktop only): the pointer leaves through the top of the
  // window. Listened to only after a minimum time on the page, and never on
  // touch devices (no hover pointer = no signal, and no sneaky substitute).
  useEffect(() => {
    if (!armed || open || trigger !== 'exit-intent') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let listening = false;

    const onMouseOut = (e: MouseEvent) => {
      if (!listening || !isExitIntent(e)) return;
      if (!canShowPrompt()) return;
      markPromptShown();
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };

    const timer = setTimeout(() => {
      listening = true;
    }, EXIT_INTENT_MIN_TIME_MS);
    document.addEventListener('mouseout', onMouseOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, [armed, open, trigger]);

  const close = useCallback(() => {
    markPromptDismissed();
    setVisible(false);
    setOpen(false);
    returnFocusRef.current?.focus?.();
  }, []);

  // Enter animation, scroll lock, focus handling.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep Tab inside the dialog.
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  const copy = COPY[trigger];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={close}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-prompt-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] bg-white p-6 shadow-2xl outline-none transition duration-300 motion-reduce:transition-none sm:max-w-[520px] sm:rounded-[24px] sm:p-8 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <p className="mb-2 text-xs font-bold tracking-[0.16em] text-brand uppercase">
          Demande immobilière
        </p>
        <h2
          id="request-prompt-title"
          className="font-sora mb-2 pr-8 text-[22px] leading-tight font-extrabold tracking-[-0.03em] text-neutral-900"
        >
          {copy.title}
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-gray-600">{copy.text}</p>
        <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-1.5 text-[13px] text-gray-700">
              <Check className="h-4 w-4 flex-shrink-0 text-brand" aria-hidden />
              {perk}
            </li>
          ))}
        </ul>

        <PropertyRequestForm
          variant="plain"
          defaults={defaults}
          onSubmitted={markPromptSubmitted}
        />
      </div>
    </div>
  );
}
