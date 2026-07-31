import type { CSSProperties, ReactNode } from "react";
import { cx } from "./ui/cx";

export type SectionTone = "missed" | "today" | "backlog";

/** Each section wears its own accent, per the design: Missed magenta, Today
 *  cyan, Backlog muted — so the eye finds the urgent one first. */
const TONE: Record<SectionTone, string> = {
  missed: "--color-missed",
  today: "--color-today",
  backlog: "--color-backlog",
};

export function SectionHeading({
  tone,
  children,
  count,
  className,
  open,
  onToggle,
}: {
  tone: SectionTone;
  children: ReactNode;
  count?: ReactNode;
  className?: string;
  /** Omit both to render a plain, non-interactive heading. */
  open?: boolean;
  onToggle?: () => void;
}) {
  const collapsible = onToggle !== undefined;

  return (
    <div
      style={{ "--ui-accent": `var(${TONE[tone]})` } as CSSProperties}
      className={cx("mb-3 flex items-center gap-2", className)}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          // `aria-expanded` is what makes this a disclosure rather than a
          // mystery: it tells a screen reader the list is hidden, which the
          // caret alone only says visually.
          aria-expanded={open}
          className={cx(
            "-my-2 flex cursor-pointer items-center gap-2 py-2 font-display text-xl",
            "tracking-section uppercase italic [color:var(--ui-accent)] outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "inline-block font-body text-xs transition-transform",
              open ? "rotate-90" : "rotate-0",
            )}
          >
            ▶
          </span>
          {children}
        </button>
      ) : (
        <span className="font-display text-xl tracking-section uppercase italic [color:var(--ui-accent)]">
          {children}
        </span>
      )}
      <span className="h-px flex-1 [background:var(--ui-accent)] opacity-25" />
      {count !== undefined && (
        <span className="font-numeric text-xs font-bold [color:var(--ui-accent)]">{count}</span>
      )}
    </div>
  );
}
