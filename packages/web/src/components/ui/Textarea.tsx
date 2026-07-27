import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field, type FieldProps } from "./Field";
import { INPUT_BASE, INPUT_SIZE, INPUT_TONE, INPUT_VARS, type InputSize } from "./Input";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    Pick<FieldProps, "label" | "hint" | "required" | "error"> {
  size?: InputSize;
  invalid?: boolean;
  /** The design never lets a textarea grow past its rows — resize stays off. */
  resizable?: boolean;
}

export function Textarea({
  size = "md",
  invalid = false,
  resizable = false,
  rows = 2,
  label,
  hint,
  required,
  error,
  className,
  style,
  id,
  ...rest
}: TextareaProps) {
  const field = (
    <textarea
      id={id}
      rows={rows}
      aria-invalid={invalid || Boolean(error) || undefined}
      style={{ ...INPUT_VARS, ...style }}
      className={cx(
        INPUT_BASE,
        INPUT_SIZE[size],
        INPUT_TONE[invalid || error ? "danger" : "default"],
        resizable ? "resize-y" : "resize-none",
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
