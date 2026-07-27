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

const CHECKED = "border-2 border-lime bg-lime text-ink-inverse";
const UNCHECKED = "border-2 border-check-off bg-transparent text-transparent";
/** A day the routine is not scheduled on: present, inert, and visibly so. */
const MUTED = "border border-cell-idle bg-transparent text-ink-ghost peer-disabled:opacity-100";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "type"> {
  checked?: boolean;
  size?: CheckboxSize;
  /** Unscheduled — renders a dot and does not respond. */
  muted?: boolean;
  /** Today's column in the weekly grid wears a cyan halo. */
  ring?: boolean;
  label?: string;
  className?: string;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked = false,
  size = "md",
  muted = false,
  ring = false,
  label,
  onChange,
  disabled,
  className,
  style,
  ...rest
}: CheckboxProps) {
  const inert = disabled || muted;
  return (
    <label className={cx("inline-flex", inert ? "cursor-default" : "cursor-pointer", className)}>
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
        style={{
          ...(ring ? { boxShadow: "0 0 0 2px var(--color-ring-today)" } : {}),
          ...style,
        }}
        className={cx(BASE, SIZE[size], muted ? MUTED : checked ? CHECKED : UNCHECKED, "w-full")}
      >
        {muted ? "·" : checked ? "✓" : ""}
      </span>
    </label>
  );
}
