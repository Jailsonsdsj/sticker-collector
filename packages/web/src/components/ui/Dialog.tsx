import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { backdropClose, useModal } from "./useModal";

export type DialogTone = "default" | "danger";

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
        "m-auto max-w-[min(28rem,calc(100vw-2.75rem))] border p-5 text-ink",
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
