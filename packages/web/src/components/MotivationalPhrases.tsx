import { useState } from "react";
import { PHRASE_INTERVAL_MS, phraseIndexAt, usePhrases } from "../lib/motivationalPhrases";
import { useNow } from "../lib/useNow";
import { MotivationalPhrasesDialog } from "./MotivationalPhrasesDialog";

/**
 * A line of encouragement between the wallet and the search field, sliding to
 * the next one every five minutes.
 *
 * **The phrase is the button.** Tapping it opens the list to add or remove
 * phrases — a separate "Edit" button beside a centred line pushed it
 * off-centre, and one below it was a second thing to look at on a card meant
 * to hold one.
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

  const phrases = Array.isArray(data) ? data : [];
  const phrase = phrases[phraseIndexAt(now, phrases.length)];

  if (isLoading) return null;

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
          onClick={() => setEditing(true)}
          className="block w-full cursor-pointer px-5 py-5 text-center outline-none transition-[color] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan"
        >
          {phrase ? (
            <span
              key={phrase.id}
              aria-live="polite"
              className="animate-phrase-in block font-body text-xl text-ink-secondary italic leading-snug break-words hover:text-ink"
            >
              {phrase.text}
            </span>
          ) : (
            <span className="block font-body text-xl text-ink-dim italic leading-snug hover:text-ink-secondary">
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
