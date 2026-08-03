import type { CSSProperties } from "react";
import type { DailyReview } from "../lib/dailyReview";
import { Badge, Button, Coin, Dialog } from "./ui";

export interface DailyReviewDialogProps {
  review: DailyReview | null;
  /** "Yesterday" on the daily prompt; the date itself when opened from the
   *  calendar, where the day is the thing that was clicked. */
  heading?: string;
  onClose: () => void;
}

/**
 * What you finished on a day, read back to you.
 *
 * A dialog rather than a screen: it is a look back, not a place to work, and
 * the only action in it is "close". It carries the three things worth reading —
 * the title, the epic, and what it paid — because that is what the occurrence
 * and the task already know. Nothing is stored to make this page exist.
 *
 * It never opens empty. A modal that says "you did nothing yesterday" is a
 * punishment, and this app's whole economy is built the other way round.
 */
export function DailyReviewDialog({ review, heading, onClose }: DailyReviewDialogProps) {
  // Nothing rendered at all when there is no day to show. A closed <dialog>
  // still has a DOM, so leaving the body mounted put "undefined things
  // finished" in it — invisible in a browser, and exactly the kind of thing a
  // screen reader reads out anyway.
  if (!review) return null;

  return (
    <Dialog
      open
      // The one dialog that carries a list: wider so long titles do not
      // truncate, and taller so a good day is not read four rows at a time.
      size="lg"
      onClose={onClose}
      title={heading ?? review.date}
      footer={
        <Button tone="lime" onClick={onClose}>
          Nice
        </Button>
      }
    >
      <p className="font-body text-md text-ink-secondary">
        {review.rows.length === 1 ? "One thing finished" : `${review.rows.length} things finished`},
        worth{" "}
        <span className="inline-flex items-baseline gap-1 font-numeric font-bold text-coin">
          <Coin size="xs" />
          {review.coins}
        </span>
        .
      </p>

      <ul className="mt-4 flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
        {review.rows.map((row) => (
          <li
            key={row.taskId}
            className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2"
            // The epic's own accent down the leading edge, the same way a task
            // row wears it on the home screen.
            style={
              row.epicAccent
                ? ({
                    "--ui-accent": `var(--color-${row.epicAccent})`,
                    borderLeft: "3px solid var(--ui-accent)",
                  } as CSSProperties)
                : undefined
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-body text-md text-ink">{row.title}</span>
              {row.epic && (
                <Badge tone="neutral" size="sm">
                  {row.epic}
                </Badge>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-numeric text-2xs font-bold text-coin">
              <Coin size="xs" />+{row.coins}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
