import { coinsToHours, type PuzzleSpend } from "@sticker-collector/shared";
import { Markdown } from "./Markdown";
import { Coin, Dialog } from "./ui";

export interface PuzzleInfoDialogProps {
  open: boolean;
  title: string;
  description: string | null;
  spend: PuzzleSpend;
  onClose: () => void;
}

/**
 * One coin is one minute, so a price is a length of time.
 *
 * `2h 30m`, and `30m` under the hour — an hours field reading `0h` is a field
 * asking to be read twice.
 */
function asTime(coins: number): string {
  const { hours, minutes } = coinsToHours(coins);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Line({ label, coins, tone }: { label: string; coins: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-body text-sm text-ink-secondary">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={`font-numeric text-xl font-bold ${tone}`}>{asTime(coins)}</span>
        <span className="flex items-center gap-1 font-numeric text-2xs text-ink-muted">
          <Coin size="xs" />
          {coins.toLocaleString()}
        </span>
      </span>
    </div>
  );
}

/**
 * What this puzzle has cost, and what finishing it still will.
 *
 * **Time first, coins second.** One coin is one minute of effort, which is the
 * conversion the wallet already puts on screen — and "4h 20m to go" answers the
 * question a price does not: whether finishing this is an evening or a
 * fortnight. The coin figure stays beside it because the economy is integer
 * coins and the buttons outside this dialog are priced in them.
 *
 * The description lives here rather than on the board because the board is the
 * picture: at 4x zoom the last thing wanted is prose above it. It is rendered
 * as markdown, the same as a task's.
 */
export function PuzzleInfoDialog({
  open,
  title,
  description,
  spend,
  onClose,
}: PuzzleInfoDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {description ? (
          <Markdown className="font-body text-md text-ink-secondary leading-relaxed">
            {description}
          </Markdown>
        ) : (
          // Said rather than left blank: an absent description and a dialog
          // that failed to load look identical when the space is simply empty.
          <p className="font-body text-sm text-ink-faint italic">No description.</p>
        )}

        <div className="flex flex-col gap-2 border-border border-t pt-4">
          <Line label="Time spent" coins={spend.spent} tone="text-lime" />
          <Line label="Time remaining" coins={spend.remaining} tone="text-coin" />
          {/* The sum, because the two above are the interesting split and this
              is the number that decides whether to start at all. */}
          <Line label="Whole picture" coins={spend.total} tone="text-ink" />
        </div>
      </div>
    </Dialog>
  );
}
