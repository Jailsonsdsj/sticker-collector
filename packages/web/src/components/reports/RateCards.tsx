import type { CompletionRate } from "@sticker-collector/shared";
import { ProgressBar } from "../ui";

export interface RateCardsProps {
  rates: readonly CompletionRate[];
}

/**
 * Completion over the trailing 7, 30 and 90 days.
 *
 * Trailing rather than all-time, so recent effort is not drowned by ancient
 * history (`prd/08-reports.md` §Consistency).
 *
 * A window with nothing scheduled reads **“—”, never 0%**. The API is careful to
 * send `null` rather than zero for exactly this reason, and printing a zero here
 * would throw that distinction away at the last possible step.
 */
export function RateCards({ rates }: RateCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {rates.map((rate) => (
        <div
          key={rate.days}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-panel p-3"
        >
          <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
            {rate.days} days
          </p>
          <p className="font-numeric text-2xl font-bold text-ink">
            {rate.percent === null ? "—" : `${rate.percent}%`}
          </p>
          <ProgressBar
            value={rate.percent ?? 0}
            size="xs"
            tone="cyan"
            aria-label={`${rate.days}-day completion: ${
              rate.percent === null ? "nothing scheduled" : `${rate.percent} percent`
            }`}
          />
          <p className="font-body text-2xs text-ink-dim">
            {rate.done} of {rate.scheduled}
          </p>
        </div>
      ))}
    </div>
  );
}
