import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { claimsGesture, rowOffset, SWIPE_REVEAL_PX, swipeIntent } from "../lib/swipe";
import { Button } from "./ui";
import { cx } from "./ui/cx";

/**
 * Swipe a task row: right to pull it into today, left to delete it.
 *
 * The two directions behave differently on purpose. **Right commits at once** —
 * pinning is reversible, so a confirmation would be friction for a decision
 * that costs nothing. **Left opens the row and leaves it open**, holding a
 * Delete button out from underneath. Deleting is the one action here that a
 * stray gesture could trigger and the user cannot undo, so it takes a
 * deliberate press on a real button, not merely a long enough swipe.
 *
 * The gesture is an accelerator, never the only route: delete lives in the edit
 * form and so does the pin. A swipe cannot be performed with a keyboard, so
 * anything reachable only this way would be unreachable for some people.
 */
export interface SwipeRowProps {
  children: ReactNode;
  onPin?: () => void;
  onDelete?: () => void;
  /**
   * Why this row cannot be pinned, if it cannot.
   *
   * Present for routines and dated one-offs: the API validates a fresh
   * completion against the schedule, so pinning them would promise a tick it
   * then refuses. The swipe still responds and says so, rather than silently
   * doing nothing and reading as broken.
   */
  pinBlockedReason?: string;
  /** Multi-select owns the gesture space; swiping during it is ambiguous. */
  disabled?: boolean;
}

export function SwipeRow({
  children,
  onPin,
  onDelete,
  pinBlockedReason,
  disabled = false,
}: SwipeRowProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    start.current = null;
    setDrag(0);
    setOpen(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.pointerType === "mouse") return;
    // An open row is dismissed by touching it, the way a tap anywhere else
    // closes any other transient affordance.
    if (open) return close();
    start.current = { x: event.clientX, y: event.clientY };
    setNotice(null);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = start.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (!claimsGesture(dx, dy)) return; // not ours: let the page scroll
    setDrag(rowOffset(dx, dy));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = start.current;
    if (!from) return;

    const intent = swipeIntent(event.clientX - from.x, event.clientY - from.y);
    start.current = null;
    setDrag(0);

    if (intent === "delete") setOpen(true);
    else if (intent === "pin") {
      if (pinBlockedReason) setNotice(pinBlockedReason);
      else onPin?.();
    }
  };

  const offset = open ? -SWIPE_REVEAL_PX : drag;

  return (
    <div className="relative">
      {/* Underneath the row, uncovered as it moves aside. */}
      <div className="absolute inset-0 flex items-center justify-between">
        <span
          aria-hidden
          className={cx(
            "px-5 font-body text-sm font-bold text-today transition-opacity",
            offset > 0 ? "opacity-100" : "opacity-0",
          )}
        >
          Today
        </span>

        {/* A real button, not a label: the swipe reveals it, the press deletes.
            Rendered only once the row is open so it is not an invisible target
            sitting under every row in the list. */}
        {open && (
          <Button size="sm" tone="magenta" className="mr-3" onClick={() => onDelete?.()}>
            Delete
          </Button>
        )}
      </div>

      <div
        // `pan-y` hands vertical scrolling back to the browser while keeping the
        // horizontal axis for this row. Without it the global
        // `touch-action: manipulation` would let the page pan both ways and the
        // swipe would fight the list.
        className={cx("relative touch-pan-y", drag === 0 && "transition-transform duration-200")}
        style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={close}
      >
        {children}
      </div>

      {notice && (
        <p role="status" className="mt-1 px-3 font-body text-sm text-ink-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
