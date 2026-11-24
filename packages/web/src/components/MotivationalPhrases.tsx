import { type PointerEvent, useRef, useState } from "react";
import { PHRASE_INTERVAL_MS, phraseIndexAt, usePhrases } from "../lib/motivationalPhrases";
import { useNow } from "../lib/useNow";
import { MotivationalPhrasesDialog } from "./MotivationalPhrasesDialog";

/** Horizontal travel, in px, before a drag counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * A line of encouragement between the wallet and the search field, sliding to
 * the next one every five minutes. Swipe left for the next phrase, right for
 * the previous one.
 *
 * **The phrase is the button.** Tapping it opens the list to add or remove
 * phrases — a separate "Edit" button beside a centred line pushed it
 * off-centre, and one below it was a second thing to look at on a card meant
 * to hold one. A swipe swallows the click that follows it, so passing to the
 * next phrase never opens the editor.
 *
 * The phrase is keyed on its id, so React remounts the line when it changes
 * and the entry animation runs again — a slide rather than a silent swap.
 *
 * Quiet on failure: a phrase that cannot load is not worth an error banner on
 * the home screen. The card falls back to its empty prompt, still tappable.
 */
export function MotivationalPhrases() {
  const { data, isLoading } = usePhrases();
  const now = useNow(PHRASE_INTERVAL_MS);
  const [editing, setEditing] = useState(false);
  const [offset, setOffset] = useState(0);
  // The clock interval in which the user last swiped back, so only that
  // change enters from the left; the next timed advance slides in normally.
  const [backAt, setBackAt] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const phrases = Array.isArray(data) ? data : [];
  const phrase = phrases[phraseIndexAt(now, phrases.length, offset)];
  const tick = Math.floor(now.getTime() / PHRASE_INTERVAL_MS);
  const back = backAt === tick;

  if (isLoading) return null;

  const onPointerDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (!from || phrases.length < 2) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    swiped.current = true;
    // Swiping left pulls the next phrase in from the right, like a page.
    const step = dx < 0 ? 1 : -1;
    setBackAt(step < 0 ? tick : null);
    setOffset((o) => o + step);
  };

  const onClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setEditing(true);
  };

  return (
    <>
      <section
        aria-label="Motivational phrase"
        // The cover wash: a quiet two-colour ground that sets the card apart
        // from the flat panels around it without competing with the wallet.
        className="mb-4 overflow-hidden rounded-2xl border border-border [background:var(--gradient-cover)]"
      >
        <button
          type="button"
          // The visible text is the phrase; the name says what tapping does.
          aria-label={phrase ? `${phrase.text} — edit phrases` : "Add a motivational phrase"}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null;
          }}
          // Vertical drags still scroll the page; horizontal ones are ours.
          className="block w-full cursor-pointer touch-pan-y select-none px-5 py-4 text-center outline-none transition-[color] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan"
        >
          {phrase ? (
            <span
              key={`${phrase.id}:${offset}`}
              aria-live="polite"
              className={`${back ? "animate-phrase-in-back" : "animate-phrase-in"} block font-body text-lg text-ink-secondary italic leading-snug break-words hover:text-ink`}
            >
              {phrase.text}
            </span>
          ) : (
            <span className="block font-body text-lg text-ink-dim italic leading-snug hover:text-ink-secondary">
              No phrases yet — tap to add one.
            </span>
          )}
        </button>
      </section>

      <MotivationalPhrasesDialog
        open={editing}
        phrases={phrases}
        onClose={() => setEditing(false)}
      />
    </>
  );
}
