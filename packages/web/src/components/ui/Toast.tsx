import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export type ToastTone = "neutral" | "earn" | "spend" | "danger";

/**
 * DERIVED — the bundle has no toast. Built from the system's own language: the
 * panel ground, a hairline border, an accent bar down the leading edge, and the
 * same overshoot the coin ticker pops on.
 *
 * Presentational only. The queue, the timers and the undo window belong to T-11
 * — do not grow a provider in here.
 */
const TONE: Record<ToastTone, string> = {
  neutral: "--color-ink-muted",
  earn: "--color-lime",
  spend: "--color-magenta",
  danger: "--color-magenta",
};

export interface ToastProps {
  tone?: ToastTone;
  title?: ReactNode;
  children?: ReactNode;
  /** The undo affordance. Rendered trailing, always reachable by thumb. */
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Toast({
  tone = "neutral",
  title,
  children,
  action,
  onDismiss,
  className,
}: ToastProps) {
  return (
    <output
      style={{ "--ui-accent": `var(${TONE[tone]})` } as CSSProperties}
      className={cx(
        "flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border",
        "bg-panel py-3 pr-3 pl-4 shadow-md animate-toast-in",
        "border-l-4 [border-left-color:var(--ui-accent)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {title && <div className="font-body text-base font-bold text-ink">{title}</div>}
        {children && <div className="font-body text-md text-ink-secondary">{children}</div>}
      </div>
      {action}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer rounded-md px-2 py-1 font-body text-base text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          ✕
        </button>
      )}
    </output>
  );
}

/** Stacks toasts above the tab bar, out of the way of the safe-area inset. */
export function ToastViewport({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3",
        "px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] [&>*]:pointer-events-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
