import { type Grid, placePiece } from "@sticker-collector/shared";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { imageSrc } from "../lib/imageUpload";
import { PIECE_ATTRIBUTE } from "../lib/placement";
import {
  distance,
  type Frame,
  fitContent,
  fitView,
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
  /** The master's own shape. The picture keeps it; only the scale changes. */
  image: { width: number; height: number };
  grid: Grid;
  /** Indexes that have been bought. Absence is locked. */
  owned: ReadonlySet<number>;
  /** Locked pieces show nothing at all rather than grayscale art. */
  hideLocked: boolean;
  /** Currently picked out for buying. Selection itself is the caller's. */
  selected?: ReadonlySet<number>;
  /** A tap that was not a drag, on a locked piece. */
  onPick?: (index: number) => void;
  /** Bumped by the caller to put the picture back where it started. */
  resetToken?: number;
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
  image,
  grid,
  owned,
  hideLocked,
  selected,
  onPick,
  resetToken = 0,
}: PuzzleBoardProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  /**
   * The visible box, measured.
   *
   * The board fills the screen and the picture keeps whatever shape it was
   * imported at, so the two are only the same shape by accident — every bound
   * below needs both.
   */
  const [box, setBox] = useState<Frame>({ width: 0, height: 0 });
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

  /** The picture at scale 1: the whole of it, as large as the frame allows. It
   *  keeps its own shape — only the scale changes. */
  const content = fitContent(image, box);
  const ready = content.width > 0;

  // Re-fit whenever the box changes (rotation, resize) or the caller asks. Both
  // land on the same view, which is what makes "reset" mean "as it opened".
  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver !== "function") return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* `resetToken` is a re-run signal, not a value this reads: the caller bumps
     it to say "put the picture back". Without it in the deps the effect only
     fires on a resize, and the Fit button does nothing. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetToken re-runs the fit on demand
  useEffect(() => {
    if (ready) setView(fitView(content, box));
    // `content` is a fresh object each render, so the primitives are the deps
    // that actually change.
  }, [content.width, content.height, box, ready, resetToken]);
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
      setView((current) =>
        zoomAbout(current, next, midpoint(a as Point, b as Point), content, box),
      );
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
    setView((current) =>
      panBy(current, { x: at.x - previous.x, y: at.y - previous.y }, content, box),
    );
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
      // Fills whatever space the screen gives it. The picture inside stays
      // square; the black around it is the shape of the screen, not a bug.
      className="relative size-full touch-none overflow-hidden bg-void"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-testid="puzzle-canvas"
        className="absolute top-0 left-0 grid"
        style={{
          // A real square in pixels, positioned entirely by the transform. An
          // `inset-0` layer would take the frame's shape and stretch the cut.
          // A real rectangle in pixels, positioned entirely by the transform.
          // An `inset-0` layer would take the frame's shape and shear the cut.
          width: content.width || "100%",
          height: content.height || "100%",
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
          transformOrigin: "0 0",
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`,
        }}
      >
        {Array.from({ length: total }, (_, index) => (
          <Piece
            /* The index IS the identity here: piece 5 is the fifth cell of a
               fixed grid and the key a purchase is recorded under. The list is
               generated from a length, so it can never reorder or be filtered
               — the two things this rule exists to catch. */
            // biome-ignore lint/suspicious/noArrayIndexKey: the index is the piece's identity
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
        // Grayscale is a filter, never a second asset. Drained AND pushed
        // down hard: at 0.55 a locked piece still read as part of the picture,
        // so a half-finished puzzle looked merely washed out instead of
        // half-finished. The contrast with an owned piece is the progress bar
        // you actually look at.
        //
        // A picked piece is lifted back to full brightness. A ring alone was
        // not enough to see at 1× on a dark tile, and not being able to tell
        // what you have picked is fatal on a screen whose whole job is picking.
        ...(owned ? {} : { filter: `grayscale(1) brightness(${selected ? 1 : 0.3})` }),
      }
    : {};

  return (
    <button
      type="button"
      // How the landing animation finds this tile. An attribute rather than an
      // id: ids are unique per document, and the same board can legitimately be
      // mounted twice while a route transitions.
      {...{ [PIECE_ATTRIBUTE]: index }}
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
