import { scoreBand } from "@sticker-collector/shared";

export interface WeekScoreColumnProps {
  /** One entry per week row of the calendar beside it, top to bottom. */
  scores: readonly (number | null)[];
}

/** The three bands, as the tokens that draw them. */
const BAND_COLOUR: Record<string, string> = {
  low: "var(--color-score-low)",
  mid: "var(--color-score-mid)",
  high: "var(--color-score-high)",
};

/**
 * The weekly scores, as a column standing **beside** the calendar rather than
 * inside it.
 *
 * It was the eighth column of the calendar's own grid, and that is exactly what
 * it looked like: an `R` sitting in the row of `M T W T F S S` reads as an
 * eighth weekday. A month has seven columns; this is a different measurement of
 * the same rows, and it belongs next to them, not among them.
 *
 * **Alignment is the whole difficulty.** Two separate grids do not agree about
 * row heights on their own. This one is a flex column that stretches to the
 * calendar's height, with a header cell matching the weekday initials and one
 * `flex-1` cell per week — so the rows divide exactly as the calendar's do,
 * given the same `gap-1`. Measured in a browser rather than assumed: the two
 * are checked to land on the same pixel rows.
 */
export function WeekScoreColumn({ scores }: WeekScoreColumnProps) {
  return (
    // `w-7` rather than a square: the cell's height comes from the calendar row
    // it sits against, so its width is the only thing left to choose.
    <div className="flex w-7 shrink-0 flex-col gap-1">
      <abbr
        title="Week score"
        className="text-center font-body text-3xs text-ink-faint no-underline"
      >
        R
      </abbr>

      {/* A list, which is what it is — and the reason it can carry a name at
          all: a bare `div` cannot, and `role="group"` would have it pretending
          to be a fieldset around numbers nobody can edit. */}
      <ul aria-label="Week scores" className="flex flex-1 flex-col gap-1">
        {scores.map((score, index) => (
          <ScoreCell
            // The row index IS the identity: a week has no id, and two weeks
            // can legitimately score the same.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            score={score}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One week's score.
 *
 * A week with **nothing to score** shows nothing. That is a week entirely in the
 * future, or one that held no scheduled work — neither is a zero, and printing
 * one would say the user failed a week that never asked anything of them.
 */
function ScoreCell({ score }: { score: number | null }) {
  const shape = "flex flex-1 items-center justify-center rounded-md font-numeric text-2xs";

  if (score === null) {
    return <li data-score="none" className={shape} />;
  }

  return (
    <li
      data-score={score}
      data-band={scoreBand(score)}
      title={`Week score ${score}`}
      aria-label={`Week score ${score} out of 100`}
      className={`${shape} font-bold text-ink`}
      style={{ background: BAND_COLOUR[scoreBand(score)] }}
    >
      {score}
    </li>
  );
}
