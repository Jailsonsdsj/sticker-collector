import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { cx } from "./cx";

export type ChipTone = "coin" | "lime" | "violet" | "cyan" | "magenta" | "low" | "med" | "high";
export type ChipShape = "pill" | "rounded";
export type ChipSize = "sm" | "md";

/** The three priority tones carry exact tints from the design; the rest derive
 *  theirs from the accent, so a new tone never needs four new tokens. */
const TONE: Record<ChipTone, { accent: string; tint?: string; tintBorder?: string }> = {
  coin: { accent: "--color-coin" },
  lime: { accent: "--color-lime" },
  violet: { accent: "--color-violet" },
  cyan: { accent: "--color-cyan" },
  magenta: { accent: "--color-magenta" },
  low: {
    accent: "--color-prio-low-fg",
    tint: "--color-prio-low-tag",
    tintBorder: "--color-prio-low-tag-border",
  },
  med: {
    accent: "--color-prio-med-fg",
    tint: "--color-prio-med-tag",
    tintBorder: "--color-prio-med-tag-border",
  },
  high: {
    accent: "--color-prio-high-fg",
    tint: "--color-prio-high-tag",
    tintBorder: "--color-prio-high-tag-border",
  },
};

const SIZE: Record<ChipSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2 text-base",
};

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 border-[1.5px] font-bold " +
  "transition-[background,border-color,color] outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const OFF_BARE = "border-border-strong bg-transparent text-ink";
const OFF_FILLED = "border-surface-4 bg-surface-2 text-ink-secondary";
const ON_SOLID = "[background:var(--ui-accent)] [border-color:var(--ui-accent)] text-ink-inverse";
const ON_TINT =
  "[background:var(--ui-tint)] [border-color:var(--ui-accent)] [color:var(--ui-accent)]";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  shape?: ChipShape;
  size?: ChipSize;
  /** Selected chips either fill with the accent or wear it as a tint. */
  fill?: "solid" | "tint";
  /** Unselected chips sit on nothing (effort, weekday) or on a veil (filters). */
  surface?: "bare" | "filled";
  font?: "body" | "numeric";
  selected?: boolean;
}

export function Chip({
  tone = "lime",
  shape = "pill",
  size = "md",
  fill = "solid",
  surface = "bare",
  font = "numeric",
  selected = false,
  className,
  style,
  children,
  ...rest
}: ChipProps) {
  const t = TONE[tone];
  const vars = {
    "--ui-accent": `var(${t.accent})`,
    "--ui-tint": t.tint
      ? `var(${t.tint})`
      : `color-mix(in srgb, var(${t.accent}) 14%, transparent)`,
    ...style,
  } as CSSProperties;

  return (
    <button
      type="button"
      aria-pressed={selected}
      style={vars}
      className={cx(
        BASE,
        SIZE[size],
        shape === "pill" ? "rounded-full" : "rounded-lg",
        font === "numeric" ? "font-numeric" : "font-body",
        selected
          ? fill === "solid"
            ? ON_SOLID
            : ON_TINT
          : surface === "bare"
            ? OFF_BARE
            : OFF_FILLED,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
