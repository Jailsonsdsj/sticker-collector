import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { cx, toneVars } from "./cx";

export type ButtonTone = "coin" | "lime" | "magenta" | "violet" | "cyan" | "neutral";
export type ButtonVariant = "solid" | "outline" | "ghost" | "holo";
export type ButtonSize = "sm" | "md" | "lg";

/** The arcade lip: a hard offset with no blur, halved on press. Only solid and
 *  holo carry one — outline and ghost sit flat, as in the design. */
const TONE: Record<ButtonTone, { accent: string; on?: string; lip?: string; gradient?: string }> = {
  coin: { accent: "--color-coin", lip: "--shadow-lip-coin", gradient: "--gradient-cta" },
  lime: { accent: "--color-lime", lip: "--shadow-lip-lime", gradient: "--gradient-cta" },
  magenta: {
    accent: "--color-magenta",
    on: "--color-ink",
    lip: "--shadow-lip-magenta",
    gradient: "--gradient-cta-hot",
  },
  violet: { accent: "--color-violet", lip: "--shadow-lip-violet", gradient: "--gradient-holo" },
  cyan: { accent: "--color-cyan", lip: "--shadow-lip-cta", gradient: "--gradient-cool" },
  neutral: { accent: "--color-surface-2", on: "--color-ink" },
};

const SIZE: Record<ButtonSize, string> = {
  sm: "gap-1 rounded-lg px-4 py-2 text-md",
  md: "gap-2 rounded-xl px-5 py-3 text-base",
  lg: "gap-2 rounded-xl px-6 py-4 text-base",
};

const BASE =
  "inline-flex cursor-pointer items-center justify-center border border-transparent font-body font-bold " +
  "transition-[background,box-shadow,transform,border-color] outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "[background:var(--ui-accent)] [color:var(--ui-on)]",
  outline:
    "[background:var(--ui-tint)] [border-color:var(--ui-tint-border)] [color:var(--ui-accent)] " +
    "not-disabled:hover:[background:var(--ui-tint-hover)]",
  ghost:
    "[color:var(--ui-accent)] not-disabled:hover:[background:var(--ui-tint)] " +
    "not-disabled:active:[background:var(--ui-tint-hover)]",
  holo: "[background:var(--ui-gradient)] [color:var(--ui-on)]",
};

/** Pressing translates 2px into the lip, so the button visibly bottoms out. */
const LIP =
  "[box-shadow:var(--ui-lip)] not-disabled:active:translate-y-0.5 " +
  "not-disabled:active:[box-shadow:var(--ui-lip-pressed)]";

const NEUTRAL_SOLID =
  "border-border-strong not-disabled:hover:border-cyan not-disabled:hover:[color:var(--color-cyan)]";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "solid",
  tone = "coin",
  size = "md",
  block = false,
  loading = false,
  disabled,
  className,
  children,
  style,
  ...rest
}: ButtonProps) {
  const t = TONE[tone];
  const lifted = (variant === "solid" || variant === "holo") && Boolean(t.lip);

  const vars = {
    ...toneVars(t.accent, { on: t.on, gradient: t.gradient }),
    ...(t.lip ? { "--ui-lip": `var(${t.lip})`, "--ui-lip-pressed": `var(${t.lip}-pressed)` } : {}),
    ...style,
  } as CSSProperties;

  return (
    <button
      type="button"
      disabled={disabled || loading}
      style={vars}
      className={cx(
        BASE,
        SIZE[size],
        VARIANT[variant],
        lifted && LIP,
        variant === "solid" && tone === "neutral" && NEUTRAL_SOLID,
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
