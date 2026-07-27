import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field, type FieldProps } from "./Field";

export type InputTone = "default" | "numeric" | "coin" | "url" | "danger";
export type InputSize = "sm" | "md";

/** Figures set in Chivo Mono, prose in Space Grotesk — money is always gold
 *  and always mono, so a coin field is unmistakable mid-form. */
export const INPUT_TONE: Record<InputTone, string> = {
  default: "font-body font-semibold text-lg text-ink border-surface-4",
  numeric: "font-numeric font-bold text-lg text-ink border-surface-4",
  coin: "font-numeric font-bold text-lg text-coin [border-color:var(--ui-coin-border)]",
  url: "font-numeric text-md text-cyan border-surface-4",
  danger: "font-body font-semibold text-lg text-ink [border-color:var(--ui-danger-border)]",
};

export const INPUT_SIZE: Record<InputSize, string> = {
  sm: "rounded-lg px-3 py-2",
  md: "rounded-lg px-3 py-3",
};

export const INPUT_BASE =
  "w-full bg-panel border placeholder:text-ink-dim outline-none " +
  "transition-[border-color] focus-visible:border-cyan " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/** Tint borders for the two toned fields, kept off the literal path. */
export const INPUT_VARS = {
  "--ui-coin-border": "color-mix(in srgb, var(--color-coin) 28%, transparent)",
  "--ui-danger-border": "color-mix(in srgb, var(--color-magenta) 30%, transparent)",
} as const;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    Pick<FieldProps, "label" | "hint" | "required" | "error"> {
  tone?: InputTone;
  size?: InputSize;
  invalid?: boolean;
}

export function Input({
  tone = "default",
  size = "md",
  invalid = false,
  label,
  hint,
  required,
  error,
  className,
  style,
  id,
  ...rest
}: InputProps) {
  const field = (
    <input
      id={id}
      aria-invalid={invalid || Boolean(error) || undefined}
      style={{ ...INPUT_VARS, ...style }}
      className={cx(
        INPUT_BASE,
        INPUT_SIZE[size],
        INPUT_TONE[invalid || error ? "danger" : tone],
        className,
      )}
      {...rest}
    />
  );

  if (!label && !hint && !error) return field;
  return (
    <Field label={label} hint={hint} required={required} error={error} htmlFor={id}>
      {field}
    </Field>
  );
}
