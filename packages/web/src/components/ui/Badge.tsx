import type { CSSProperties, HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone =
  | "low"
  | "med"
  | "high"
  | "coin"
  | "lime"
  | "magenta"
  | "cyan"
  | "violet"
  | "neutral";
export type BadgeVariant = "tint" | "solid" | "overlay";
export type BadgeSize = "sm" | "md";

const TONE: Record<BadgeTone, { accent: string; tint?: string; tintBorder?: string; on?: string }> =
  {
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
    coin: { accent: "--color-coin" },
    lime: { accent: "--color-lime" },
    magenta: { accent: "--color-magenta", on: "--color-ink" },
    cyan: { accent: "--color-cyan" },
    violet: { accent: "--color-violet" },
    neutral: { accent: "--color-ink-muted" },
  };

const SIZE: Record<BadgeSize, string> = {
  sm: "rounded-sm px-2 py-0.5 text-3xs",
  md: "rounded-md px-2 py-1 text-2xs",
};

const BASE = "inline-flex items-center justify-center gap-1 border font-bold whitespace-nowrap";

const VARIANT: Record<BadgeVariant, string> = {
  tint: "[background:var(--ui-tint)] [border-color:var(--ui-tint-border)] [color:var(--ui-accent)]",
  solid: "[background:var(--ui-accent)] [color:var(--ui-on)] border-transparent",
  /** Sits over artwork — a scrim, not a tint, so it reads on any image. */
  overlay: "bg-scrim text-ink-overlay border-transparent",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  font?: "body" | "numeric";
}

export function Badge({
  tone = "neutral",
  variant = "tint",
  size = "md",
  font = "body",
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  const t = TONE[tone];
  const vars = {
    "--ui-accent": `var(${t.accent})`,
    "--ui-on": `var(${t.on ?? "--color-ink-inverse"})`,
    "--ui-tint": t.tint
      ? `var(${t.tint})`
      : `color-mix(in srgb, var(${t.accent}) 16%, transparent)`,
    "--ui-tint-border": t.tintBorder
      ? `var(${t.tintBorder})`
      : `color-mix(in srgb, var(${t.accent}) 40%, transparent)`,
    ...style,
  } as CSSProperties;

  return (
    <span
      style={vars}
      className={cx(
        BASE,
        SIZE[size],
        VARIANT[variant],
        font === "numeric" ? "font-numeric" : "font-body",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
