import type { PullResult, Tier } from "@sticker-collector/shared";
import { useEffect, useState } from "react";
import { imageSrc } from "../lib/imageUpload";
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
 * the slot floods from black and white into colour, and the beat is held longer
 * the rarer the tier — a legendary should not arrive at the same speed as a
 * common.
 *
 * A duplicate ends in a **choice**. Surfacing "sell for X" here is what stops a
 * repeat pull from being a dead end (`prd/05-stickers.md` §Enhancements); the
 * user decides, rather than being told what they lost.
 */
const HOLD: Record<Tier, string> = {
  common: "var(--duration-shake-common)",
  rare: "var(--duration-shake-rare)",
  epic: "var(--duration-shake-epic)",
  legendary: "var(--duration-shake-legendary)",
};

/**
 * The same four numbers in milliseconds, because a timer cannot read a CSS
 * custom property. They must match `--duration-shake-*` in `tokens.css`
 * exactly — if they drift, the actions appear before or after the reveal has
 * landed, which is the one thing this component exists to get right.
 */
export const HOLD_MS: Record<Tier, number> = {
  common: 560,
  rare: 680,
  epic: 820,
  legendary: 1000,
};

export function RevealDialog({ pull, imageKey, selling, onSell, onClose }: RevealDialogProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!pull) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), HOLD_MS[pull.tier]);
    return () => clearTimeout(timer);
  }, [pull]);

  if (!pull) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={pull.duplicate ? "You already have this one" : "New sticker"}
      footer={
        <>
          <Button variant="ghost" tone="neutral" onClick={onClose}>
            {pull.duplicate ? "Keep it" : "Nice"}
          </Button>
          {/* Only a spare copy is for sale — the first one is the collection. */}
          {pull.duplicate && (
            <Button tone="coin" disabled={selling} loading={selling} onClick={onSell}>
              Sell for {pull.refundIfSold}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div
          data-tier={pull.tier}
          data-settled={settled}
          className="relative w-40 overflow-hidden rounded-xl"
          style={{
            background: `var(--gradient-frame-${pull.tier})`,
            padding: `var(--frame-pad-${pull.tier})`,
            aspectRatio: "var(--aspect-card)",
            // The rarer the tier, the longer the reveal is held.
            animationDuration: HOLD[pull.tier],
          }}
        >
          <div className="h-full w-full overflow-hidden rounded-lg bg-surface-2">
            {imageKey && (
              <img
                src={imageSrc(imageKey)}
                alt=""
                // `motion-safe` so a reduced-motion setting gets the sticker without the show.
                className="h-full w-full object-cover motion-safe:animate-reveal-flood"
                style={{ animationDuration: HOLD[pull.tier] }}
              />
            )}
          </div>

          {pull.quantity > 1 && (
            <span className="absolute top-1 left-1">
              <Badge tone="coin" variant="solid" size="sm" font="numeric">
                ×{pull.quantity}
              </Badge>
            </span>
          )}
        </div>

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
