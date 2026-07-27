import type { ReactNode } from "react";
import { cx } from "./cx";
import { useModal } from "./useModal";

/**
 * The full-screen editing surface — the task form and the album wizard. A fixed
 * header (leading action / display title / trailing action) over a body that is
 * the only thing that scrolls, so the actions never leave the thumb.
 */
export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  /** Usually a ghost "Cancel". */
  leading?: ReactNode;
  /** Usually the primary "Save". */
  trailing?: ReactNode;
  /** Sits under the header, above the scroll area — the wizard's stepper. */
  toolbar?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  leading,
  trailing,
  toolbar,
  className,
  children,
}: SheetProps) {
  const ref = useModal(open, onClose);

  return (
    <dialog
      ref={ref}
      // No backdrop handler: a sheet fills the viewport, so there is nothing
      // behind it to click. Escape still closes, via the native dialog.
      className={cx(
        "m-0 h-full max-h-none w-full max-w-none bg-void text-ink",
        "animate-sheet-in backdrop:animate-scrim-in backdrop:bg-scrim-modal",
        "open:flex open:flex-col",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 pt-5 pb-3">
        <div className="flex min-w-16 justify-start">{leading}</div>
        {title && (
          <span className="font-display text-xl tracking-display uppercase italic">{title}</span>
        )}
        <div className="flex min-w-16 justify-end">{trailing}</div>
      </header>
      {toolbar && <div className="shrink-0 border-b border-border px-5 py-3">{toolbar}</div>}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-7">
        {children}
      </div>
    </dialog>
  );
}
