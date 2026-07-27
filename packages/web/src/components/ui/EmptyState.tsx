import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * DERIVED — the bundle has no empty state. Built from the system's own voice:
 * the display face shouting in italic caps, secondary copy under it, and a
 * single action. Nothing decorative; an empty list is a prompt, not a poster.
 */
export interface EmptyStateProps {
  /** A glyph, not an illustration — the design uses ✓ ▦ ◈ ◆ ▲ throughout. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border",
        "bg-surface-1 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="font-body text-4xl text-ink-faint leading-none">
          {icon}
        </span>
      )}
      <h3 className="font-display text-2xl tracking-display text-ink-muted uppercase italic">
        {title}
      </h3>
      {description && (
        <p className="max-w-xs font-body text-md text-ink-dim leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
