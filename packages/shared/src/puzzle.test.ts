import { describe, expect, it } from "vitest";
import { IMAGE_SIZES } from "./image";
import {
  type Grid,
  gridFor,
  isPieceIndex,
  isPiecePreset,
  MAX_PIECES,
  MAX_PIECES_PER_UNLOCK,
  PIECE_PRESETS,
  pieceCount,
  placePiece,
} from "./puzzle";

describe("the counts on offer", () => {
  it("every preset has a grid that multiplies back to it", () => {
    // The whole reason presets exist: a count the user picks must be a count
    // the board can actually lay out.
    for (const pieces of PIECE_PRESETS) {
      expect(pieceCount(gridFor(pieces))).toBe(pieces);
    }
  });

  it("names the largest preset as the ceiling", () => {
    expect(Math.max(...PIECE_PRESETS)).toBe(MAX_PIECES);
  });

  it("keeps one unlock inside a batch D1 will take", () => {
    // One spend plus one insert per piece, in a single batch. 61 statements.
    expect(MAX_PIECES_PER_UNLOCK).toBeLessThan(MAX_PIECES);
    expect(MAX_PIECES_PER_UNLOCK + 1).toBeLessThanOrEqual(100);
  });

  it("recognises a preset, and refuses a number that merely looks like one", () => {
    expect(isPiecePreset(48)).toBe(true);
    expect(isPiecePreset(50)).toBe(false);
    expect(isPiecePreset(0)).toBe(false);
  });
});

describe("choosing the grid", () => {
  it("picks the most balanced pair, because the master is square", () => {
    // Guarded here so the assumption below cannot rot silently.
    expect(IMAGE_SIZES.puzzle.width).toBe(IMAGE_SIZES.puzzle.height);

    expect(gridFor(12)).toEqual({ rows: 3, cols: 4 });
    expect(gridFor(24)).toEqual({ rows: 4, cols: 6 });
    expect(gridFor(48)).toEqual({ rows: 6, cols: 8 });
    expect(gridFor(96)).toEqual({ rows: 8, cols: 12 });
    expect(gridFor(144)).toEqual({ rows: 12, cols: 12 });
  });

  it("never returns a letterbox when a squarer pair exists", () => {
    // 48 as 4×12 is a legal factor pair and a bad puzzle.
    for (const pieces of PIECE_PRESETS) {
      const { rows, cols } = gridFor(pieces);
      expect(Math.abs(cols - rows)).toBeLessThanOrEqual(4);
    }
  });

  it("puts rows first when the pair is uneven, always", () => {
    // The direction has to be fixed. If the same count transposed between
    // callers, a piece index would name a different piece depending on who
    // asked — and the index is what a purchase is keyed by.
    for (const pieces of PIECE_PRESETS) {
      const { rows, cols } = gridFor(pieces);
      expect(rows).toBeLessThanOrEqual(cols);
    }
  });

  it("follows a wide image with a wide grid", () => {
    // The point of the change: 48 pieces of a 16:9 photo cut 6x8, not 8x6.
    // Cutting a wide picture with a tall grid makes every piece a sliver.
    expect(gridFor(48, { width: 16, height: 9 })).toEqual({ rows: 6, cols: 8 });
    expect(gridFor(12, { width: 16, height: 9 })).toEqual({ rows: 3, cols: 4 });
  });

  it("follows a tall image with a tall grid", () => {
    expect(gridFor(48, { width: 9, height: 16 })).toEqual({ rows: 8, cols: 6 });
    expect(gridFor(12, { width: 9, height: 16 })).toEqual({ rows: 4, cols: 3 });
  });

  it("goes further for a shape further from square", () => {
    // A panorama should not be cut like a snapshot.
    expect(gridFor(24, { width: 3, height: 1 })).toEqual({ rows: 3, cols: 8 });
  });

  it("gives the same answer for a square as for no aspect at all", () => {
    for (const pieces of PIECE_PRESETS) {
      expect(gridFor(pieces, { width: 100, height: 100 })).toEqual(gridFor(pieces));
    }
  });

  it("ignores a degenerate aspect rather than dividing by it", () => {
    // A zero edge cannot come from a stored image, but it can come from a row
    // read before its columns existed.
    expect(gridFor(48, { width: 0, height: 0 })).toEqual(gridFor(48));
  });

  it("handles a prime count rather than looping forever", () => {
    // Not a preset, but the function is exported and a caller could ask.
    expect(gridFor(7)).toEqual({ rows: 1, cols: 7 });
  });
});

describe("where a piece sits", () => {
  const grid: Grid = { rows: 3, cols: 4 };

  it("reads left to right, top to bottom", () => {
    expect(placePiece(0, grid)).toMatchObject({ row: 0, col: 0 });
    expect(placePiece(3, grid)).toMatchObject({ row: 0, col: 3 });
    expect(placePiece(4, grid)).toMatchObject({ row: 1, col: 0 });
    expect(placePiece(11, grid)).toMatchObject({ row: 2, col: 3 });
  });

  it("gives the corners 0% and 100%, so the window spans the whole image", () => {
    // These map onto `background-position`, where 0/100 are the two edges —
    // not the piece's own left edge. Getting this wrong shows as a picture
    // that never quite reaches its own border.
    expect(placePiece(0, grid)).toMatchObject({ xPercent: 0, yPercent: 0 });
    expect(placePiece(11, grid)).toMatchObject({ xPercent: 100, yPercent: 100 });
  });

  it("spaces the middle evenly", () => {
    expect(placePiece(1, grid).xPercent).toBeCloseTo(100 / 3);
    expect(placePiece(2, grid).xPercent).toBeCloseTo(200 / 3);
  });

  it("does not divide by zero on a single row or column", () => {
    // `(col / (cols - 1))` is the trap. A 1×n grid is reachable through
    // `gridFor` on a prime count.
    expect(placePiece(0, { rows: 1, cols: 7 })).toMatchObject({ yPercent: 0 });
    expect(placePiece(0, { rows: 7, cols: 1 })).toMatchObject({ xPercent: 0 });
  });
});

describe("which indexes exist", () => {
  const grid: Grid = { rows: 3, cols: 4 };

  it("accepts every piece and nothing else", () => {
    expect(isPieceIndex(0, grid)).toBe(true);
    expect(isPieceIndex(11, grid)).toBe(true);
    expect(isPieceIndex(12, grid)).toBe(false);
    expect(isPieceIndex(-1, grid)).toBe(false);
  });

  it("refuses a fraction, which a JSON body can carry", () => {
    expect(isPieceIndex(1.5, grid)).toBe(false);
  });
});
