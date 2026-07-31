import type { PullResult, Tier } from "@sticker-collector/shared";
import { useCallback, useState } from "react";
import { Envelope, REVEAL_MS } from "./reveal/Envelope";
import { Badge, Button, Dialog } from "./ui";

export interface RevealDialogProps {
  pull: PullResult | null;
  imageKey: string | null;
  selling: boolean;
  onSell: () => void;
  onClose: () => void;
}

/**
 * The moment a pull pays out.
 *
 * This is the app's single most rewarding moment, so it earns real attention:
 * a pack shakes, opens, and the sticker comes out of it, with more of a show
 * the rarer the tier — a legendary should not arrive the same way as a common.
 *
 * The sticker is then **held until the user acts**. Nothing dismisses itself:
 * the reward is the looking, and a dialog that closed on a timer would take it
 * away from whoever paused to enjoy it.
 *
 * A duplicate ends in a **choice**. Surfacing "sell for X" here is what stops a
 * repeat pull from being a dead end (`prd/05-stickers.md` §Enhancements); the
 * user decides, rather than being told what they lost.
 */
/**
 * How long the whole reveal takes, per tier, in milliseconds.
 *
 * Re-exported from the envelope so callers and tests have one number to trust.
 * A timer cannot read a CSS custom property, so these must match
 * `--duration-shake-*` in `tokens.css`; if they drift, the actions appear
 * before or after the reveal has landed.
 */
export const HOLD_MS: Record<Tier, number> = REVEAL_MS;

export function RevealDialog({ pull, imageKey, selling, onSell, onClose }: RevealDialogProps) {
  const [settled, setSettled] = useState(false);
  // Identity-stable, or the envelope's effect would re-run — and restart its
  // timeline — on every render of this dialog.
  const onOpened = useCallback(() => setSettled(true), []);

  if (!pull) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      // Wider than a confirmation. This is the app's one moment of ceremony and
      // the sticker is the content, not an illustration beside it.
      className="max-w-[min(38rem,calc(100vw-1.25rem))]"
      title={pull.duplicate ? "You already have this one" : "New sticker"}
      footer={
        // Hidden until the sticker is out: a button to dismiss a reveal that
        // has not happened yet invites skipping the only reward in the app.
        settled ? (
          <>
            <Button variant="ghost" tone="neutral" onClick={onClose}>
              {pull.duplicate ? "Keep it" : "Nice"}
            </Button>
            {/* Only a spare copy is for sale — the first one is the collection. */}
            {/* A duplicate ends in a CHOICE, beside the sticker itself
              (prd/05-stickers.md §Enhancements) — a pull that returns a dupe
              must not be a dead end. */}
            {pull.duplicate && (
              <Button tone="coin" disabled={selling} loading={selling} onClick={onSell}>
                Sell for {pull.refundIfSold}
              </Button>
            )}
          </>
        ) : null
      }
    >
      <div className="flex flex-col items-center gap-3">
        {/* Keyed by the pull so a second roll runs the whole sequence again
            rather than reusing a finished timeline. */}
        {/* Once it is out, the sticker itself is the way on — "displayed until
            the user clicks in". The footer says the same thing in words, for a
            keyboard and for anyone who does not read a picture as a button. */}
        {/* ONE button, always. Rendering the envelope in two different places
            — bare, then wrapped once it opens — unmounts and remounts it, and
            a remounted component runs its timeline again: the reveal played
            twice. The button is simply inert until there is something to
            place. */}
        <button
          type="button"
          disabled={!settled}
          onClick={onClose}
          aria-label="Place it in the album"
          className="block w-full rounded-2xl outline-none not-disabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          <Envelope
            key={`${pull.stickerId}-${pull.quantity}`}
            tier={pull.tier}
            imageKey={imageKey}
            quantity={pull.quantity}
            onOpened={onOpened}
          />
        </button>

        <Badge tone="neutral" variant="tint" size="sm">
          {pull.tier}
        </Badge>

        <p className="text-center font-body text-sm text-ink-secondary">
          {pull.duplicate ? (
            <>
              That is your <span className="font-numeric font-bold text-ink">{pull.quantity}</span>
              {ordinalSuffix(pull.quantity)} copy. A spare sells for{" "}
              <span className="font-numeric font-bold text-coin">{pull.refundIfSold}</span> — always
              less than the pull cost, so keeping it is never the wrong answer.
            </>
          ) : (
            <>Added to the album.</>
          )}
        </p>
      </div>
    </Dialog>
  );
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  if (n % 10 === 1) return "st";
  if (n % 10 === 2) return "nd";
  if (n % 10 === 3) return "rd";
  return "th";
}
