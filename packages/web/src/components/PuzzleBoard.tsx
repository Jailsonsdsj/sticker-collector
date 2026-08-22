import { type Grid, placePiece } from "@sticker-collector/shared";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { imageSrc } from "../lib/imageUpload";
import {
  distance,
  INITIAL_VIEW,
  isTap,
  midpoint,
  type Point,
  panBy,
  type View,
  zoomAbout,
} from "../lib/puzzleBoard";
import { cx } from "./ui/cx";

export interface PuzzleBoardProps {
  imageKey: string;
  grid: Grid;
  /** Indexes that have been bought. Absence is locked. */
  owned: ReadonlySet<number>;
  /** Locked pieces show nothing at all rather than grayscale art. */
  hideLocked: boolean;
  /** Currently picked out for buying. Selection itself is the caller's. */
  selected?: ReadonlySet<number>;
  /** A tap that was not a drag, on a locked piece. */
  onPick?: (index: number) => void;
}

/**
 * The picture, cut into a grid of windows onto one image.
 *
 * **Every piece is the same image**, at the same scale, showing a different
 * part of it — `background-size` blows the master up to the size of the whole
 * board and `background-position` slides each tile to its own share. That is
 * what makes an unlocked piece line up with its neighbours *exactly* rather
 * than approximately: they were never separate pictures. It is also why 144
 * pieces cost one HTTP request and one decode instead of 144 of each.
 *
 * Locked pieces carry their border as an **inset shadow**, not a border: a real
 * border participates in layout, and one pixel taken off every tile is a hairline
 * of background showing through a picture that is supposed to be whole.
 *
 * Grayscale is a CSS filter (CLAUDE.md). There is no second, grey copy of
 * anything.
 */
export function PuzzleBoard({
  imageKey,
  grid,
  owned,
  hideLocked,
  selected,
  onPick,
}: PuzzleBoardProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  /** Live pointers, so a second finger turns a drag into a pinch. */
  const pointers = useRef(new Map<number, Point>());
  /** Where the gesture began, to tell a tap from a drag when it ends. */
  const origin = useRef<Point | null>(null);
  /**
   * Set once a gesture travels beyond the slop, and read by the tile's click.
   *
   * A drag ends over some tile, and that tile's `click` fires — so without this
   * every pan selects whatever piece the finger happened to lift over. Cleared
   * on the next press, not on pointer-up: the click arrives after it.
   */
  const dragged = useRef(false);
  const pinch = useRef<{ gap: number; scale: number } | null>(null);

  const size = () => frame.current?.getBoundingClientRect().width ?? 0;
  const local = (event: ReactPointerEvent): Point => {
    const box = frame.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const at = local(event);
    pointers.current.set(event.pointerId, at);
    if (pointers.current.size === 1) {
      origin.current = at;
      dragged.current = false;
    }
    if (pointers.current.size === 2) {
      // A pinch is never a tap, so capture is safe and wanted from the start:
      // a second finger straying outside the board mid-pinch would otherwise
      // end the gesture.
      capture(event);
      const [a, b] = [...pointers.current.values()];
      // The gap at the moment the second finger lands is the baseline every
      // later gap is measured against, so the picture does not jump on contact.
      pinch.current = { gap: distance(a as Point, b as Point), scale: view.scale };
      // Two fingers is never a tap, whatever either of them does next.
      origin.current = null;
      dragged.current = true;
    }
  }

  /**
   * Keep receiving this pointer even if it leaves the element.
   *
   * Guarded twice over: it does not exist in jsdom, and it throws
   * `NotFoundError` in a real browser for any id that is not an active pointer.
   * Either would abandon the handler mid-gesture, and capture is an
   * optimisation — the gesture must never depend on it.
   */
  function capture(event: ReactPointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Without it a drag ends when the finger leaves the board. Worse, not
      // broken.
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId) as Point;
    const at = local(event);
    pointers.current.set(event.pointerId, at);

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const gap = distance(a as Point, b as Point);
      if (gap === 0) return; // fingers on one pixel: no ratio to take
      const next = (pinch.current.scale * gap) / pinch.current.gap;
      setView((current) => zoomAbout(current, next, midpoint(a as Point, b as Point), size()));
      return;
    }

    if (origin.current && !isTap(origin.current, at)) {
      // Capture here and NOT on pointerdown. Capturing at press makes the
      // browser dispatch the following `click` at the capturing element rather
      // than at the tile under the finger — so every tap would land on the
      // board and no piece would ever be selectable. Taking it only once a
      // drag is real keeps taps intact and still keeps a fast drag alive when
      // the finger leaves the board.
      capture(event);
      dragged.current = true;
    }
    setView((current) => panBy(current, { x: at.x - previous.x, y: at.y - previous.y }, size()));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) origin.current = null;
  }

  /** A tile was clicked — but only a tap counts, not the end of a drag. */
  const pick = (index: number) => {
    if (dragged.current || !onPick) return;
    onPick(index);
  };

  const total = grid.rows * grid.cols;

  return (
    <div
      ref={frame}
      // `touch-action: none` or the browser scrolls the page instead of letting
      // the board pan — the same trap the sticker viewer fell into, from the
      // other side. Nothing here scrolls; everything here is a gesture.
      className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl border border-border bg-surface-1"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-testid="puzzle-canvas"
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
          transformOrigin: "0 0",
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`,
        }}
      >
        {Array.from({ length: total }, (_, index) => (
          <Piece
            key={index}
            index={index}
            grid={grid}
            imageKey={imageKey}
            owned={owned.has(index)}
            hidden={hideLocked}
            selected={Boolean(selected?.has(index))}
            onPick={onPick ? pick : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function Piece({
  index,
  grid,
  imageKey,
  owned,
  hidden,
  selected,
  onPick,
}: {
  index: number;
  grid: Grid;
  imageKey: string;
  owned: boolean;
  hidden: boolean;
  selected: boolean;
  onPick?: (index: number) => void;
}) {
  const place = placePiece(index, grid);
  const showArt = owned || !hidden;

  const style: CSSProperties = showArt
    ? {
        backgroundImage: `url(${imageSrc(imageKey)})`,
        // The master blown up to the size of the whole board, then slid so this
        // tile's share is the part on show.
        backgroundSize: `${grid.cols * 100}% ${grid.rows * 100}%`,
        backgroundPosition: `${place.xPercent}% ${place.yPercent}%`,
        // Grayscale is a filter, never a second asset. Dimmed as well as
        // drained: grey at full brightness reads as "photographed in 1950"
        // rather than as "not yours yet".
        //
        // A picked piece is lifted back towards full brightness. A ring alone
        // was not enough to see at 1× on a dark tile — and not being able to
        // tell what you have picked is fatal on a screen whose whole job is
        // picking.
        ...(owned ? {} : { filter: `grayscale(1) brightness(${selected ? 1 : 0.55})` }),
      }
    : {};

  return (
    <button
      type="button"
      // A button per tile rather than one hit-test on the board: the browser
      // already knows which element a tap landed on at any zoom, and it makes
      // every piece reachable by keyboard for free.
      disabled={owned || !onPick}
      onClick={() => onPick?.(index)}
      aria-label={`Piece ${index + 1}${owned ? ", yours" : ""}`}
      aria-pressed={owned || !onPick ? undefined : selected}
      style={style}
      className={cx(
        "size-full",
        !showArt && "bg-surface-2",
        // An INSET shadow, not a border: a border participates in layout, and
        // one pixel off every tile is a hairline of background running through
        // a picture that is meant to be whole.
        !owned && "shadow-[inset_0_0_0_1px_var(--color-border)]",
        selected && "shadow-[inset_0_0_0_3px_var(--color-cyan)]",
        !owned && onPick && "cursor-pointer",
      )}
    />
  );
}
