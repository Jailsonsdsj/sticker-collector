import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export type CheckboxSize = "sm" | "md";

const SIZE: Record<CheckboxSize, string> = {
  sm: "size-6 text-md",
  md: "size-7 text-base",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-md font-body font-bold " +
  "transition-[background,border-color,box-shadow] " +
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan " +
  "peer-disabled:opacity-40";

const CHECKED = "border-lime bg-lime text-ink-inverse";
const UNCHECKED = "border-check-off bg-transparent text-transparent";

/**
 * How heavy the box's edge is.
 *
 * `strong` is for a box whose day is actually scheduled — in the weekly grids
 * an empty box means two different things, "not today's job" and "today's job,
 * not done yet", and at 2px they looked the same. Border widths are not
 * tokenised yet (backlog TD-03), which is why these are literals.
 */
const WEIGHT = { normal: "border-2", strong: "border-[3px]" } as const;
/** A day the routine is not scheduled on: present, inert, and visibly so. */
const MUTED = "border border-cell-idle bg-transparent text-ink-ghost peer-disabled:opacity-100";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "type"> {
  checked?: boolean;
  size?: CheckboxSize;
  /** Unscheduled — renders a dot and does not respond. */
  muted?: boolean;
  /** A heavier edge, for a box whose day the routine actually runs on. */
  strong?: boolean;
  /**
   * Stretch the box to the label's width.
   *
   * The weekly grids render wide cells rather than squares, so they set this
   * AND give the label a width. It used to be applied unconditionally, which
   * silently broke every other use: `w-full` overrides the width half of
   * `size-6`/`size-7`, and with no width on the label the percentage collapsed
   * to the borders alone — a 4px-wide tap target on the home screen.
   */
  fill?: boolean;
  label?: string;
  className?: string;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked = false,
  size = "md",
  muted = false,
  strong = false,
  fill = false,
  label,
  onChange,
  disabled,
  className,
  style,
  ...rest
}: CheckboxProps) {
  const inert = disabled || muted;
  return (
    <label
      className={cx(
        "inline-flex items-center justify-center",
        // 44px minimum touch target, per Apple's guidance — the same rule the
        // tab bar follows. The visible box stays 24/28px; the label around it is
        // what the finger actually has to hit. Grid cells opt out: seven of them
        // across a phone cannot each be 44px, and they are already wide.
        !fill && "min-h-11 min-w-11",
        inert ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={inert}
        aria-label={label}
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      <span
        aria-hidden
        style={style}
        className={cx(
          BASE,
          SIZE[size],
          WEIGHT[strong && !muted ? "strong" : "normal"],
          muted ? MUTED : checked ? CHECKED : UNCHECKED,
          fill && "w-full",
        )}
      >
        {muted ? "·" : checked ? "✓" : ""}
      </span>
    </label>
  );
}
