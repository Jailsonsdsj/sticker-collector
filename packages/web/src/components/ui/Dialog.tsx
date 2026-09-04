import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { backdropClose, useModal } from "./useModal";

export type DialogTone = "default" | "danger";

/**
 * How much room the panel gets.
 *
 * `md` is a confirmation: a sentence and two buttons, and going wider would
 * make a one-line question look like a form. `lg` is for a dialog that carries
 * a *list* — the daily review — where the extra width is what stops long task
 * titles truncating.
 *
 * Two named sizes rather than a `className` override: two `max-w-*` utilities
 * on one element are decided by stylesheet order, not by which was passed last,
 * so an override would work or not depending on how Tailwind happened to emit
 * them.
 */
export type DialogSize = "md" | "lg";

const SIZE: Record<DialogSize, string> = {
  md: "max-w-[min(28rem,calc(100vw-2.75rem))]",
  lg: "max-w-[min(36rem,calc(100vw-2.75rem))]",
};

/**
 * The floor under a content-sized panel.
 *
 * A dialog still takes the width of what is in it — that has not changed, and
 * it is why a one-line confirmation is not a billboard. What it may no longer
 * do is get *narrow*: a short title over a short sentence collapsed to a column
 * barely wider than its own buttons, which reads as a rendering fault rather
 * than as a small dialog.
 *
 * Clamped to the viewport by the same `100vw - 2.75rem` the maxima use, so the
 * floor can never push a panel off the side of a phone — on a 390px screen the
 * clamp wins and the dialog is simply as wide as the screen allows.
 */
const MIN_WIDTH = "min-w-[min(20rem,calc(100vw-2.75rem))]";

/** Destructive dialogs wear the magenta border and the darker ground, so the
 *  weight of the decision is legible before the copy is read. */
const TONE: Record<DialogTone, { panel: string; title: string }> = {
  default: {
    panel: "border-border [background:var(--gradient-panel-raised)]",
    title: "text-ink",
  },
  danger: {
    panel: "[border-color:var(--ui-danger-border)] [background:var(--gradient-dialog-danger)]",
    title: "text-magenta",
  },
};

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  tone?: DialogTone;
  size?: DialogSize;
  /** Actions row, pinned to the bottom of the panel. */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  tone = "default",
  size = "md",
  footer,
  className,
  children,
}: DialogProps) {
  const ref = useModal(open, onClose);
  const t = TONE[tone];

  return (
    /* The keyboard path here is the native dialog's own Escape handling, which
       useModal() listens for. A parallel onKeyDown would double-fire. */
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively
    <dialog
      ref={ref}
      onClick={backdropClose(onClose)}
      style={
        {
          "--ui-danger-border": "color-mix(in srgb, var(--color-magenta) 40%, transparent)",
        } as CSSProperties
      }
      className={cx(
        "m-auto border p-5 text-ink",
        MIN_WIDTH,
        SIZE[size],
        "rounded-4xl shadow-lg animate-dialog-in",
        "backdrop:animate-scrim-in backdrop:bg-scrim-modal",
        "open:flex open:flex-col open:gap-4",
        t.panel,
        className,
      )}
    >
      {title && (
        <h2
          className={cx(
            "font-display text-2xl leading-tight tracking-display uppercase italic",
            t.title,
          )}
        >
          {title}
        </h2>
      )}
      {children && (
        <div className="font-body text-md text-ink-secondary leading-relaxed">{children}</div>
      )}
      {footer && <div className="flex gap-3 [&>*]:flex-1">{footer}</div>}
    </dialog>
  );
}
