/**
 * Panning and zooming a square board, as pure arithmetic.
 *
 * None of this needs a DOM, and all of it is the part that goes wrong: a zoom
 * that drifts away from the fingers, a drag that walks the picture off the
 * screen, a pinch that inverts when the fingers cross. The component reads
 * pointer positions and calls these; it decides nothing.
 *
 * **The model.** A square of side `side` sits inside a frame that is usually
 * NOT square — the board fills the screen, the picture does not — and is
 * transformed with `transform-origin: 0 0` as `translate(x, y) scale(s)`. The
 * content therefore occupies `[x, x + side·s]` on each axis. Origin at the
 * corner rather than the centre because it makes the bounds arithmetic a
 * subtraction instead of a case analysis.
 *
 * The frame being taller than the content is the normal case on a phone, and it
 * is what `clampPan` below is really about: a picture smaller than the space it
 * sits in must be **centred**, not draggable into a corner.
 */

/** The visible box. Not square, except by accident. */
export interface Frame {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface View {
  /** Container pixels, `transform-origin: 0 0`. */
  pan: Point;
  scale: number;
}

/** Fully zoomed out is the whole picture, which is what the board opens at. */
export const MIN_SCALE = 1;

/**
 * Four times in. At 144 pieces a tile is 1/12 of the board — about 30 px on a
 * phone — and 4× makes it a comfortable tap target without magnifying a
 * 1536 px master past its own resolution.
 */
export const MAX_SCALE = 4;

/** Before the frame has been measured. `fitView` replaces it on first layout. */
export const INITIAL_VIEW: View = { pan: { x: 0, y: 0 }, scale: MIN_SCALE };

/**
 * The picture at rest: whole, and centred in whatever space it has.
 *
 * This is what the reset button returns to, and what the board opens at. The
 * centring falls out of `clampPan` rather than being computed twice.
 */
export function fitView(content: Frame, frame: Frame): View {
  return { pan: clampPan({ x: 0, y: 0 }, MIN_SCALE, content, frame), scale: MIN_SCALE };
}

/**
 * The picture at scale 1: the whole of it, as large as the frame allows.
 *
 * `contain`, not `cover` — the point of the opening view is that you can see
 * all of it. Zooming is what fills the screen.
 */
export function fitContent(image: Frame, frame: Frame): Frame {
  if (image.width <= 0 || image.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { width: 0, height: 0 };
  }
  const factor = Math.min(frame.width / image.width, frame.height / image.height);
  return { width: image.width * factor, height: image.height * factor };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/**
 * Keep the content covering the board.
 *
 * At scale 1 there is nowhere to go and the only legal pan is zero — which
 * falls out of the arithmetic rather than needing its own branch. Without this
 * a drag walks the picture into empty space and leaves the user looking at the
 * background wondering where their puzzle went.
 */
export function clampPan(pan: Point, scale: number, content: Frame, frame: Frame): Point {
  // Two regimes per axis, and the axes can be in different ones at the same
  // time — which is exactly what a square picture in a tall frame looks like
  // when you zoom in far enough to fill the width but not the height.
  const axis = (value: number, extent: number, span: number) => {
    // Smaller than the space it is in: centred, and there is nowhere to drag
    // it. Anything else leaves the picture pinned to a corner with a void
    // beside it.
    if (span <= extent) return (extent - span) / 2;
    // Bigger: it may travel, but never far enough to show a gap at an edge.
    return Math.min(Math.max(value, extent - span), 0);
  };

  return {
    x: axis(pan.x, frame.width, content.width * scale),
    y: axis(pan.y, frame.height, content.height * scale),
  };
}

/**
 * Zoom while keeping the content under `focus` where it is.
 *
 * `focus` is in container coordinates — the midpoint between two fingers, or
 * the pointer for a double-tap. Zooming about the board's centre instead is the
 * thing that feels broken: the picture slides out from under the fingers doing
 * the pinching.
 */
export function zoomAbout(
  view: View,
  nextScale: number,
  focus: Point,
  content: Frame,
  frame: Frame,
): View {
  const scale = clampScale(nextScale);
  // The content point under the focus must not move: solve x' from
  // (focus - x) / scale === (focus - x') / scale'.
  const pan = {
    x: focus.x - ((focus.x - view.pan.x) * scale) / view.scale,
    y: focus.y - ((focus.y - view.pan.y) * scale) / view.scale,
  };
  return { pan: clampPan(pan, scale, content, frame), scale };
}

/** Drag by a delta in container pixels, bounded. */
export function panBy(view: View, delta: Point, content: Frame, frame: Frame): View {
  return {
    ...view,
    pan: clampPan({ x: view.pan.x + delta.x, y: view.pan.y + delta.y }, view.scale, content, frame),
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Which piece is under a point, or null if the point is off the board.
 *
 * Container coordinates in, piece index out — the inverse of the transform, so
 * a tap lands on the tile the user is looking at whatever the zoom. Doing this
 * with a click handler per tile would be simpler and is what the component
 * does; this exists for the cases where a tap has to be resolved from a
 * gesture that might have been a drag.
 */
export function pieceAt(
  point: Point,
  view: View,
  content: Frame,
  grid: { rows: number; cols: number },
): number | null {
  const u = (point.x - view.pan.x) / (content.width * view.scale);
  const v = (point.y - view.pan.y) / (content.height * view.scale);
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;

  const col = Math.min(grid.cols - 1, Math.floor(u * grid.cols));
  const row = Math.min(grid.rows - 1, Math.floor(v * grid.rows));
  return row * grid.cols + col;
}

/**
 * Did this pointer travel far enough to have been a drag rather than a tap?
 *
 * A finger never lands and lifts on exactly one pixel, so a strict comparison
 * makes every tap a drag and nothing is ever selectable. Six pixels is the
 * slop a thumb produces at rest.
 */
export const TAP_SLOP = 6;

export function isTap(from: Point, to: Point): boolean {
  return distance(from, to) <= TAP_SLOP;
}
