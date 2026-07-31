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
      {/* A <dialog> renders in the TOP LAYER, so it sits outside AppShell
          entirely — none of the shell's safe-area padding reaches it. With the
          status bar set to black-translucent the sheet therefore runs under the
          clock and the battery, and this header is where Cancel and Save live.
          The inset has to be reapplied here, at the only element that can. */}
      <header
        className={cx(
          "flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 pb-3",
          "pt-[calc(env(safe-area-inset-top)+var(--space-5))]",
        )}
      >
        <div className="flex min-w-16 justify-start">{leading}</div>
        {title && (
          <span className="font-display text-xl tracking-display uppercase italic">{title}</span>
        )}
        <div className="flex min-w-16 justify-end">{trailing}</div>
      </header>
      {toolbar && <div className="shrink-0 border-b border-border px-5 py-3">{toolbar}</div>}
      {/* Same problem at the other end: the home indicator overlaps the last
          field, and a sheet is exactly where a Save button tends to sit. */}
      <div
        className={cx(
          "flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4",
          // --space-7 does not exist: the token scale skips 7. `pb-7` was
          // Tailwind arithmetic on --spacing (4px x 7 = 28px), so the calc has
          // to do the same rather than invent a token.
          "pb-[calc(env(safe-area-inset-bottom)+var(--spacing)*7)]",
        )}
      >
        {children}
      </div>
    </dialog>
  );
}
