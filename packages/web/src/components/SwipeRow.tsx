import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { claimsGesture, rowOffset, swipeIntent } from "../lib/swipe";
import { cx } from "./ui/cx";

/**
 * Swipe a task row between the two lists you actually move work through: right
 * starts it, left pulls it into today.
 *
 * **Both directions commit at once**, and both are reversible by the opposite
 * swipe — which is why neither asks. Delete used to live on the left, behind a
 * revealed button, precisely because it was the one thing here a stray gesture
 * could do and the user could not undo; it has moved to the task view, where it
 * still asks before it acts. Nothing on this row is destructive any more.
 *
 * The gesture is an accelerator, never the only route: both moves exist in the
 * task view too. A swipe cannot be performed with a keyboard, so anything
 * reachable only this way would be unreachable for some people.
 */
export interface SwipeRowProps {
  children: ReactNode;
  /** Left: into For today. */
  onPin?: () => void;
  /** Right: into In progress. */
  onStart?: () => void;
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
  onStart,
  pinBlockedReason,
  disabled = false,
}: SwipeRowProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    start.current = null;
    setDrag(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.pointerType === "mouse") return;
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

    // Right starts it; left moves it into today. Both are reversible by the
    // opposite swipe, so neither asks first.
    if (intent === "start") onStart?.();
    else if (intent === "pin") {
      if (pinBlockedReason) setNotice(pinBlockedReason);
      else onPin?.();
    }
  };

  const offset = drag;

  return (
    <div className="relative">
      {/* Underneath the row, uncovered as it moves aside. Each side names the
          list the row is heading for, so the gesture explains itself before it
          commits. */}
      <div className="absolute inset-0 flex items-center justify-between">
        <span
          aria-hidden
          className={cx(
            "px-5 font-body text-sm font-bold text-cyan transition-opacity",
            offset > 0 ? "opacity-100" : "opacity-0",
          )}
        >
          In progress
        </span>
        <span
          aria-hidden
          className={cx(
            "px-5 font-body text-sm font-bold text-today transition-opacity",
            offset < 0 ? "opacity-100" : "opacity-0",
          )}
        >
          Today
        </span>
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
