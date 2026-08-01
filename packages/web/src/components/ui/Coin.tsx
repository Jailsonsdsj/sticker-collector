import { cx } from "./cx";

/**
 * The coin: a star front and a "1 COIN" reverse, back to back.
 *
 * Two faces in one 3D space, so a spin turns onto the reverse rather than a
 * flat disc squashing to a line and springing back. **No rim** — the design's
 * third image is deliberately unused, which makes the coin a zero-thickness
 * object: at exactly side-on there is nothing to draw, and it reads as a very
 * thin coin turning rather than a thick one.
 *
 * **Star side forward.** The reverse is only ever seen mid-turn, so anything
 * static — a price, a reward — shows the star.
 *
 * Decorative everywhere: the number beside it carries the meaning, and a coin
 * announced next to "400" would be read as "400 image".
 */
export type CoinSize = "xs" | "sm" | "md" | "lg";

/**
 * Matched to the number each one sits beside. A 16px coin next to a 20px figure
 * reads as a bullet point rather than as currency, which is what the old glyph
 * got wrong.
 */
const SIZE: Record<CoinSize, string> = {
  xs: "size-4",
  sm: "size-5",
  md: "size-7",
  lg: "size-12",
};

export interface CoinProps {
  size?: CoinSize;
  /** Keeps turning. The wallet's coin does; a price tag's does not. */
  spin?: boolean;
  className?: string;
}

export function Coin({ size = "sm", spin = false, className }: CoinProps) {
  return (
    <span aria-hidden className={cx("coin shrink-0", SIZE[size], className)}>
      <span className={cx("coin-body", spin && "animate-coin-spin")}>
        <img src="/coin/front.png" alt="" className="coin-face" draggable={false} />
        <img src="/coin/back.png" alt="" className="coin-face coin-face-back" draggable={false} />
      </span>
    </span>
  );
}
