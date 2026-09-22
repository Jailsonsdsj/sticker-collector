import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";

export interface OptionsMenuItem {
  label: string;
  onSelect: () => void;
  /** `danger` for anything that destroys something. */
  tone?: "default" | "danger";
}

export interface OptionsMenuProps {
  /**
   * What the menu acts on, named.
   *
   * A shelf of twelve cards would otherwise hold twelve buttons all called
   * "Options", which is a screen reader listing the same control twelve times
   * and a test that cannot say which one it meant.
   */
  label: string;
  items: OptionsMenuItem[];
  /** Where the trigger sits. The caller positions it; this does not assume a corner. */
  className?: string;
}

/**
 * A ⋯ button and the short list of things it can do.
 *
 * **Not a `<dialog>`,** unlike every other layer in this app. The actions here
 * open one — deleting asks for confirmation — and a modal that exists only to
 * launch another modal is two full-screen interruptions to reach one button.
 * A menu anchored to the thing it acts on is the lighter half of that pair.
 *
 * It closes on Escape, on a click anywhere outside it, and on choosing
 * something. Escape and outside-click both hand focus back to the trigger: the
 * menu sits over a card that is itself a link, so leaving focus on a dismissed
 * element would put the next Tab somewhere the user never was.
 */
export function OptionsMenu({ label, items, className }: OptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      // `pointerdown`, not `click`: the card underneath is a link, and a click
      // listener would let the press through to it before this could close.
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Stopped, so a menu inside a dialog does not close both at once.
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    /**
     * Two elements, each with exactly one position utility.
     *
     * The outer one is the caller's to place; the inner one is what the popover
     * is measured against. Merging them — `cx("relative", className)` with an
     * `absolute` coming in — puts two `position` rules on one element, and
     * Tailwind resolves that by stylesheet order rather than by which was
     * written last. It resolved to `relative`, which dropped the ⋯ out of the
     * card's corner and into the flex column below the cover, on every card.
     * jsdom has no layout, so every test still passed.
     */
    <div ref={root} className={className}>
      <div className="relative">
        <button
          ref={trigger}
          type="button"
          // A disclosure, deliberately — not `aria-haspopup="menu"`. That
          // promises menu semantics, and a real menu owns its arrow keys and
          // roving focus. This is a short list of buttons that Tab reaches in
          // order, which is the behaviour actually implemented here.
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Options for ${label}`}
          onClick={() => setOpen((was) => !was)}
          // 44px of hit area around a 28px chip: the padding is the target. A
          // control this small in the corner of a card is otherwise a thumb's
          // best guess, and the guess next to it opens the album.
          className="flex min-h-11 min-w-11 items-center justify-center p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          {/* A scrim rather than a tint, the same as an overlay `Badge`: this
            sits on artwork nobody chose for its contrast. */}
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-scrim font-body text-md leading-none text-ink-overlay"
          >
            ⋯
          </span>
        </button>

        {open && (
          <ul
            id={menuId}
            // `z-30`: the card is one tile in a grid, and the tiles after it in
            // the DOM paint over anything that merely overlaps them.
            // `panel-raised`, not a `surface-*`: those are white at 3–14% opacity,
            // meant to lift a panel off a known background. This floats over
            // artwork, and a 6% white sheet over a photograph is a photograph.
            className="absolute top-full right-0 z-30 mt-1 min-w-36 overflow-hidden rounded-xl border border-border bg-panel-raised shadow-lg"
          >
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    // Closed first: the handler opens a dialog, and a menu still
                    // on screen behind it is a second thing to dismiss.
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cx(
                    "flex min-h-11 w-full items-center px-4 font-body text-md",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan",
                    item.tone === "danger" ? "text-magenta" : "text-ink",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
