import { cx } from "./cx";

export type SkeletonVariant = "text" | "block" | "card";

/**
 * DERIVED — the bundle has no skeleton. A surface veil pulsing on a token-owned
 * duration; no shimmer sweep, because the ground is near-black and a moving
 * highlight reads as a glitch rather than as loading.
 *
 * `card` matches the fixed 5:7 of a sticker or cover, so a loading grid does
 * not reflow when the real art lands.
 */
const VARIANT: Record<SkeletonVariant, string> = {
  text: "h-3 rounded-sm",
  block: "h-20 rounded-xl",
  card: "aspect-card w-full rounded-lg",
};

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** `text` only — renders a paragraph, last line short, as real text sits. */
  lines?: number;
  className?: string;
}

const BASE = "bg-surface-3 animate-skeleton motion-reduce:animate-none";

export function Skeleton({ variant = "text", lines = 1, className }: SkeletonProps) {
  if (variant === "text" && lines > 1) {
    return (
      <div className={cx("flex flex-col gap-2", className)} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div
            /* Fixed-length decoration with no identity and no reordering — the
               index is the only key there is. */
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={i}
            className={cx(BASE, VARIANT.text, i === lines - 1 && "w-3/5")}
          />
        ))}
      </div>
    );
  }

  return <div aria-hidden className={cx(BASE, VARIANT[variant], className)} />;
}
