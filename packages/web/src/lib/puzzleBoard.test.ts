import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampScale,
  distance,
  fitContent,
  fitView,
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

/** A square picture, which is what most of these cases are about. */
const SIZE = { width: 300, height: 300 };
/** A square frame, which is what most of these cases are about. */
const SQUARE = { width: 300, height: 300 };
/** A phone: the board fills the screen, the picture does not. */
const TALL = { width: 300, height: 600 };
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
    expect(clampPan({ x: 50, y: -80 }, 1, SIZE, SQUARE)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the content covering the board", () => {
    // At 2× the content is 600 wide in a 300 board, so the pan runs -300..0.
    expect(clampPan({ x: 100, y: 0 }, 2, SIZE, SQUARE)).toMatchObject({ x: 0 });
    expect(clampPan({ x: -900, y: 0 }, 2, SIZE, SQUARE)).toMatchObject({ x: -300 });
  });

  it("allows the two extremes exactly", () => {
    expect(clampPan({ x: 0, y: -300 }, 2, SIZE, SQUARE)).toEqual({ x: 0, y: -300 });
  });

  it("bounds a drag rather than letting it run away", () => {
    const moved = panBy(view(2, -10, -10), { x: -1000, y: -1000 }, SIZE, SQUARE);
    expect(moved.pan).toEqual({ x: -300, y: -300 });
  });
});

describe("zooming about the fingers", () => {
  it("keeps the point under the fingers where it is", () => {
    // The thing that feels broken when it is wrong: the picture slides out
    // from under the pinch.
    const focus = { x: 150, y: 150 };
    const before = view(1);
    const after = zoomAbout(before, 2, focus, SIZE, SQUARE);

    const contentUnder = (v: View) => ({
      x: (focus.x - v.pan.x) / v.scale,
      y: (focus.y - v.pan.y) / v.scale,
    });
    expect(contentUnder(after).x).toBeCloseTo(contentUnder(before).x);
    expect(contentUnder(after).y).toBeCloseTo(contentUnder(before).y);
  });

  it("holds a corner when the pinch is in the corner", () => {
    const after = zoomAbout(view(1), 2, { x: 0, y: 0 }, SIZE, SQUARE);
    expect(after.pan).toEqual({ x: 0, y: 0 });
  });

  it("clamps the result, so a zoom cannot leave a gap", () => {
    // Zooming out about a corner would otherwise pull the far edge inside the
    // board and show background through it.
    const zoomedIn = zoomAbout(view(1), 4, { x: 300, y: 300 }, SIZE, SQUARE);
    const back = zoomAbout(zoomedIn, 1, { x: 300, y: 300 }, SIZE, SQUARE);

    expect(back).toEqual({ pan: { x: 0, y: 0 }, scale: 1 });
  });

  it("respects the ceiling while still holding the focus", () => {
    const after = zoomAbout(view(1), 99, { x: 150, y: 150 }, SIZE, SQUARE);
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
    const zoomed = zoomAbout(view(1), 2, { x: 0, y: 0 }, SIZE, SQUARE);
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

describe("a square picture in a screen-shaped frame", () => {
  // The normal case on a phone: the board fills the screen, the picture does
  // not. A 300-wide, 600-tall frame holds a 300 square.
  it("centres the picture rather than pinning it to a corner", () => {
    // Anything else leaves the picture at the top with a void beneath it.
    expect(clampPan({ x: 0, y: 0 }, 1, SIZE, TALL)).toEqual({ x: 0, y: 150 });
  });

  it("refuses to let it be dragged out of the middle while it still fits", () => {
    expect(clampPan({ x: 0, y: -400 }, 1, SIZE, TALL)).toEqual({ x: 0, y: 150 });
  });

  it("lets it travel once it is bigger than the frame", () => {
    // At 3x the square is 900 tall in a 600 frame, so y runs -300..0.
    expect(clampPan({ x: 0, y: -900 }, 3, SIZE, TALL)).toMatchObject({ y: -300 });
    expect(clampPan({ x: 0, y: 400 }, 3, SIZE, TALL)).toMatchObject({ y: 0 });
  });

  it("can be centred on one axis and travelling on the other", () => {
    // At 1.5x the square is 450: wider than the 300 frame, shorter than 600.
    // Both regimes at once, which is what the two-branch clamp is for.
    const clamped = clampPan({ x: -1000, y: -1000 }, 1.5, SIZE, TALL);
    expect(clamped.x).toBe(-150);
    expect(clamped.y).toBe(75);
  });

  it("opens fitted and centred", () => {
    expect(fitView(SIZE, TALL)).toEqual({ pan: { x: 0, y: 150 }, scale: 1 });
  });

  it("fits a square frame with no offset at all", () => {
    expect(fitView(SIZE, SQUARE)).toEqual({ pan: { x: 0, y: 0 }, scale: 1 });
  });

  it("returns to exactly the opening view after zooming about a corner", () => {
    // What the reset button promises: not "roughly back", but the view it
    // opened at.
    const zoomed = zoomAbout(fitView(SIZE, TALL), 4, { x: 0, y: 0 }, SIZE, TALL);
    expect(zoomed.scale).toBe(4);

    expect(fitView(SIZE, TALL)).toEqual({ pan: { x: 0, y: 150 }, scale: 1 });
  });
});

describe("a picture that is not square", () => {
  // The change this exists for: a puzzle keeps the shape it was imported at
  // rather than being cropped to a square, so the content is a rectangle.
  const WIDE = { width: 1600, height: 900 };

  it("fits the whole picture inside the frame, never cropping it", () => {
    // `contain`, not `cover`. Filling the frame would hide the ends of the
    // picture again, which is the thing that was wrong in the first place.
    expect(fitContent(WIDE, { width: 400, height: 400 })).toEqual({ width: 400, height: 225 });
    // Height-limited this time, so the width falls out of the aspect. Compared
    // loosely because it is a third of 1600 and floats do not divide cleanly.
    const tall = fitContent(WIDE, { width: 1600, height: 300 });
    expect(tall.height).toBe(300);
    expect(tall.width).toBeCloseTo(1600 / 3);
  });

  it("keeps the aspect it was given", () => {
    const fitted = fitContent(WIDE, { width: 333, height: 999 });
    expect(fitted.width / fitted.height).toBeCloseTo(WIDE.width / WIDE.height);
  });

  it("answers nothing before the frame has been measured", () => {
    // The first paint has no box, and dividing by it would be NaN in a
    // transform — which blanks the board rather than delaying it.
    expect(fitContent(WIDE, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
    expect(fitContent({ width: 0, height: 0 }, { width: 300, height: 300 })).toEqual({
      width: 0,
      height: 0,
    });
  });

  it("centres a wide picture vertically and fills the width", () => {
    const frame = { width: 400, height: 400 };
    const content = fitContent(WIDE, frame);

    // 225 tall in a 400 frame: (400 - 225) / 2.
    expect(fitView(content, frame)).toEqual({ pan: { x: 0, y: 87.5 }, scale: 1 });
  });

  it("names the right piece of a wide picture", () => {
    // The bounds are per axis now, so a rectangle cannot be read as a square.
    const frame = { width: 400, height: 400 };
    const content = fitContent(WIDE, frame);
    const view = fitView(content, frame);
    const grid = { rows: 3, cols: 4 };

    // Top-left of the picture, which starts 87.5 down the frame.
    expect(pieceAt({ x: 1, y: 88 }, view, content, grid)).toBe(0);
    // Bottom-right, just inside.
    expect(pieceAt({ x: 399, y: 311 }, view, content, grid)).toBe(11);
    // Above the picture is not on it at all.
    expect(pieceAt({ x: 200, y: 10 }, view, content, grid)).toBeNull();
  });
});
