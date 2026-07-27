import type { ReactNode } from "react";
import { cx } from "./cx";

/** The label chrome shared by Input and Textarea: a mono kicker, a magenta
 *  asterisk when required, and an optional gold hint on the same line. */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, required, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="font-numeric text-2xs text-ink-muted font-semibold tracking-kicker uppercase"
        >
          {label}
          {required && <span className="text-prio-high-fg"> *</span>}
          {hint && <span className="text-coin normal-case tracking-normal"> · {hint}</span>}
        </label>
      )}
      {children}
      {error && <span className="font-body text-sm text-prio-high-fg">{error}</span>}
    </div>
  );
}
