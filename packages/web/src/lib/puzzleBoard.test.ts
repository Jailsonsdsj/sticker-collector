import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampScale,
  distance,
  INITIAL_VIEW,
  isTap,
  MAX_SCALE,
  MIN_SCALE,
  midpoint,
  panBy,
  pieceAt,
  TAP_SLOP,
  type View,
  zoomAbout,
} from "./puzzleBoard";

const SIZE = 300;
const view = (scale: number, x = 0, y = 0): View => ({ pan: { x, y }, scale });

describe("how far it zooms", () => {
  it("opens showing the whole picture", () => {
    expect(INITIAL_VIEW.scale).toBe(MIN_SCALE);
    expect(INITIAL_VIEW.pan).toEqual({ x: 0, y: 0 });
  });

  it("refuses to go further out than the whole picture", () => {
    // Below 1 the board would float in empty space with nothing to look at.
    expect(clampScale(0.2)).toBe(MIN_SCALE);
  });

  it("stops at the far end rather than magnifying past the master", () => {
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it("recovers from NaN instead of propagating it into the transform", () => {
    // A pinch whose two pointers land on the same pixel divides by zero, and
    // one NaN in a transform blanks the whole board.
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });
});

describe("how far it pans", () => {
  it("cannot move at all when fully zoomed out", () => {
    // Falls out of the arithmetic: at scale 1 the travel is zero.
    expect(clampPan({ x: 50, y: -80 }, 1, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the content covering the board", () => {
    // At 2× the content is 600 wide in a 300 board, so the pan runs -300..0.
    expect(clampPan({ x: 100, y: 0 }, 2, SIZE)).toMatchObject({ x: 0 });
    expect(clampPan({ x: -900, y: 0 }, 2, SIZE)).toMatchObject({ x: -300 });
  });

  it("allows the two extremes exactly", () => {
    expect(clampPan({ x: 0, y: -300 }, 2, SIZE)).toEqual({ x: 0, y: -300 });
  });

  it("bounds a drag rather than letting it run away", () => {
    const moved = panBy(view(2, -10, -10), { x: -1000, y: -1000 }, SIZE);
    expect(moved.pan).toEqual({ x: -300, y: -300 });
  });
});

describe("zooming about the fingers", () => {
  it("keeps the point under the fingers where it is", () => {
    // The thing that feels broken when it is wrong: the picture slides out
    // from under the pinch.
    const focus = { x: 150, y: 150 };
    const before = view(1);
    const after = zoomAbout(before, 2, focus, SIZE);

    const contentUnder = (v: View) => ({
      x: (focus.x - v.pan.x) / v.scale,
      y: (focus.y - v.pan.y) / v.scale,
    });
    expect(contentUnder(after).x).toBeCloseTo(contentUnder(before).x);
    expect(contentUnder(after).y).toBeCloseTo(contentUnder(before).y);
  });

  it("holds a corner when the pinch is in the corner", () => {
    const after = zoomAbout(view(1), 2, { x: 0, y: 0 }, SIZE);
    expect(after.pan).toEqual({ x: 0, y: 0 });
  });

  it("clamps the result, so a zoom cannot leave a gap", () => {
    // Zooming out about a corner would otherwise pull the far edge inside the
    // board and show background through it.
    const zoomedIn = zoomAbout(view(1), 4, { x: 300, y: 300 }, SIZE);
    const back = zoomAbout(zoomedIn, 1, { x: 300, y: 300 }, SIZE);

    expect(back).toEqual({ pan: { x: 0, y: 0 }, scale: 1 });
  });

  it("respects the ceiling while still holding the focus", () => {
    const after = zoomAbout(view(1), 99, { x: 150, y: 150 }, SIZE);
    expect(after.scale).toBe(MAX_SCALE);
  });
});

describe("reading the fingers", () => {
  it("measures the gap between two of them", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("finds the point between them", () => {
    expect(midpoint({ x: 0, y: 10 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 15 });
  });

  it("forgives the wobble in a tap", () => {
    // A finger never lands and lifts on one pixel. Without slop every tap is a
    // drag and nothing is ever selectable.
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe(true);
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP + 1, y: 100 })).toBe(false);
  });
});

describe("which piece is under a point", () => {
  const grid = { rows: 3, cols: 4 };

  it("reads the corners at rest", () => {
    expect(pieceAt({ x: 1, y: 1 }, view(1), SIZE, grid)).toBe(0);
    expect(pieceAt({ x: 299, y: 299 }, view(1), SIZE, grid)).toBe(11);
  });

  it("follows the transform when zoomed in", () => {
    // Zoomed 2× with the top-left held, the first tile now fills a quarter of
    // the board — so the centre of the board is no longer piece 5.
    const zoomed = zoomAbout(view(1), 2, { x: 0, y: 0 }, SIZE);
    expect(pieceAt({ x: 10, y: 10 }, zoomed, SIZE, grid)).toBe(0);
    expect(pieceAt({ x: 299, y: 299 }, zoomed, SIZE, grid)).toBe(
      pieceAt({ x: 149, y: 149 }, view(1), SIZE, grid),
    );
  });

  it("answers null off the board rather than clamping to an edge piece", () => {
    // Clamping would make a tap in the margin buy a corner piece.
    expect(pieceAt({ x: -5, y: 10 }, view(1), SIZE, grid)).toBeNull();
    expect(pieceAt({ x: 10, y: 301 }, view(1), SIZE, grid)).toBeNull();
  });

  it("never returns an index past the last piece", () => {
    // The exact right edge is the classic off-by-one: u === 1 would floor to
    // `cols`, naming a piece that does not exist.
    expect(pieceAt({ x: 300, y: 300 }, view(1), SIZE, grid)).toBeNull();
    expect(pieceAt({ x: 299.99, y: 299.99 }, view(1), SIZE, grid)).toBe(11);
  });
});
