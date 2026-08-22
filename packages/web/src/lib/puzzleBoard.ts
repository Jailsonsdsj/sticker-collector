/**
 * Panning and zooming a square board, as pure arithmetic.
 *
 * None of this needs a DOM, and all of it is the part that goes wrong: a zoom
 * that drifts away from the fingers, a drag that walks the picture off the
 * screen, a pinch that inverts when the fingers cross. The component reads
 * pointer positions and calls these; it decides nothing.
 *
 * **The model.** An inner element the same size as the board is transformed
 * with `transform-origin: 0 0` as `translate(x, y) scale(s)`, so the content
 * occupies `[x, x + size·s]` on each axis. Origin at the corner rather than the
 * centre because it makes the bounds arithmetic below a subtraction instead of
 * a case analysis.
 */

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

export const INITIAL_VIEW: View = { pan: { x: 0, y: 0 }, scale: MIN_SCALE };

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
export function clampPan(pan: Point, scale: number, size: number): Point {
  const travel = size - size * scale; // ≤ 0
  const axis = (value: number) => Math.min(Math.max(value, travel), 0);
  return { x: axis(pan.x), y: axis(pan.y) };
}

/**
 * Zoom while keeping the content under `focus` where it is.
 *
 * `focus` is in container coordinates — the midpoint between two fingers, or
 * the pointer for a double-tap. Zooming about the board's centre instead is the
 * thing that feels broken: the picture slides out from under the fingers doing
 * the pinching.
 */
export function zoomAbout(view: View, nextScale: number, focus: Point, size: number): View {
  const scale = clampScale(nextScale);
  // The content point under the focus must not move: solve x' from
  // (focus - x) / scale === (focus - x') / scale'.
  const pan = {
    x: focus.x - ((focus.x - view.pan.x) * scale) / view.scale,
    y: focus.y - ((focus.y - view.pan.y) * scale) / view.scale,
  };
  return { pan: clampPan(pan, scale, size), scale };
}

/** Drag by a delta in container pixels, bounded. */
export function panBy(view: View, delta: Point, size: number): View {
  return {
    ...view,
    pan: clampPan({ x: view.pan.x + delta.x, y: view.pan.y + delta.y }, view.scale, size),
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
  size: number,
  grid: { rows: number; cols: number },
): number | null {
  const u = (point.x - view.pan.x) / (size * view.scale);
  const v = (point.y - view.pan.y) / (size * view.scale);
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
