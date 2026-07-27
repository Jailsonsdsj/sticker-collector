import type { CSSProperties } from "react";
import { cx } from "./cx";

export type ProgressSize = "xs" | "sm" | "md" | "lg";
export type ProgressFill = "gradient" | "accent";
export type ProgressTone = "cyan" | "lime" | "coin" | "violet" | "magenta";

/** xs is the wizard stepper, sm the epic bar, md/lg the album bars — the two
 *  large ones carry the percentage inside the fill. */
const SIZE: Record<ProgressSize, string> = {
  xs: "h-1 rounded-full",
  sm: "h-2 rounded-md",
  md: "h-6 rounded-md",
  lg: "h-8 rounded-lg",
};

const LABEL_SIZE: Record<ProgressSize, string> = {
  xs: "text-3xs",
  sm: "text-3xs",
  md: "text-xs",
  lg: "text-sm",
};

const LABEL_TEXT =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-numeric font-bold";

const TONE: Record<ProgressTone, string> = {
  cyan: "--color-cyan",
  lime: "--color-lime",
  coin: "--color-coin",
  violet: "--color-violet",
  magenta: "--color-magenta",
};

export interface ProgressBarProps {
  /** 0–100. Clamped, so a bad computation cannot overflow the track. */
  value: number;
  size?: ProgressSize;
  fill?: ProgressFill;
  tone?: ProgressTone;
  /** Rendered centred inside the track — "82%" or "82% · 49/60". */
  label?: string;
  className?: string;
  "aria-label"?: string;
}

export function ProgressBar({
  value,
  size = "md",
  fill = "gradient",
  tone = "cyan",
  label,
  className,
  "aria-label": ariaLabel,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label}
      style={{ "--ui-accent": `var(${TONE[tone]})` } as CSSProperties}
      className={cx("relative w-full overflow-hidden bg-surface-3", SIZE[size], className)}
    >
      <div
        className={cx(
          "h-full transition-[width] duration-500 ease-out",
          fill === "gradient"
            ? "[background:var(--gradient-progress)]"
            : "[background:var(--ui-accent)]",
        )}
        style={{ width: `${pct}%` }}
      />
      {/* The label is drawn twice — ink on the empty track, ink-inverse clipped
          to the fill. The prototype only ever shows it at 82%, where one colour
          happens to work; at 4% a single ink-inverse label is invisible. */}
      {label && (
        <>
          <span className={cx(LABEL_TEXT, LABEL_SIZE[size], "text-ink")}>{label}</span>
          <span
            aria-hidden
            style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
            className={cx(LABEL_TEXT, LABEL_SIZE[size], "text-ink-inverse")}
          >
            {label}
          </span>
        </>
      )}
    </div>
  );
}
