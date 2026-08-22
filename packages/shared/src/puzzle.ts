/**
 * A jigsaw puzzle: one image, cut into a grid, bought back a piece at a time.
 *
 * The pieces are **windows onto one stored master**, never images of their own.
 * A 144-piece puzzle as 144 objects would be 144 uploads against a 10 ms CPU
 * budget, and it would break the rule that there is one colour master per image
 * (CLAUDE.md). It also makes the picture whole by construction: unlocked pieces
 * are the same image at the same scale with their borders removed, so they line
 * up exactly rather than approximately.
 */

/**
 * The counts on offer.
 *
 * Presets rather than a free number, because a count is not a grid — 48 is 6×8
 * or 8×6 or 4×12, and only some of those are a puzzle. Each of these has a
 * factor pair that is close to square, which is the shape that suits a square
 * image.
 */
export const PIECE_PRESETS = [12, 24, 48, 96, 144] as const;

export type PiecePreset = (typeof PIECE_PRESETS)[number];

/** The largest preset, and therefore the largest a puzzle can be. */
export const MAX_PIECES = 144;

/**
 * How many pieces one unlock may buy.
 *
 * An unlock is one `spend()` plus one insert per piece in a single `db.batch`,
 * which is the only all-or-nothing D1 offers. 60 keeps that batch at 61
 * statements; chunking a larger one across batches would mean a partial failure
 * could take the coins and not grant every piece.
 */
export const MAX_PIECES_PER_UNLOCK = 60;

export interface Grid {
  rows: number;
  cols: number;
}

export function isPiecePreset(pieces: number): pieces is PiecePreset {
  return (PIECE_PRESETS as readonly number[]).includes(pieces);
}

/**
 * The factor pair for a count, shaped to the image it is cutting.
 *
 * A puzzle keeps the shape it was imported at, so the grid has to follow: 48
 * pieces of a 16:9 photo is 6×8 at best and 4×12 at right, and cutting it 8×6
 * would make every piece a tall sliver of a wide picture. The pair chosen is
 * the one whose own proportions land nearest the image's.
 *
 * Compared by **cross-multiplication**, so no comparison depends on a float:
 * `cols/rows` against `width/height` is `cols·height` against `rows·width`.
 *
 * With no aspect given the answer is the most balanced pair — 48 becomes 6×8,
 * 144 a clean 12×12 — which is what a square wants and what every puzzle got
 * while the master was square.
 *
 * Derived rather than stored as a table of answers, so the reasoning is visible
 * and a sixth preset needs no second edit.
 */
export function gridFor(pieces: number, aspect: { width: number; height: number } = SQUARE): Grid {
  const { width, height } = aspect.width > 0 && aspect.height > 0 ? aspect : SQUARE;
  let best: Grid | null = null;
  let bestDrift = Number.POSITIVE_INFINITY;

  // Every factor pair, both ways round: a wide image wants more columns, a tall
  // one more rows, and only trying both can give it either.
  for (let rows = 1; rows <= pieces; rows++) {
    if (pieces % rows !== 0) continue;
    const cols = pieces / rows;
    const drift = Math.abs(cols * height - rows * width);
    // `<` not `<=`: the first pair at a given drift wins, and rows ascend, so a
    // tie always resolves the same way rather than depending on iteration
    // order. A piece index has to name the same piece for every caller.
    if (drift < bestDrift) {
      bestDrift = drift;
      best = { rows, cols };
    }
  }

  return best ?? { rows: 1, cols: pieces };
}

const SQUARE = { width: 1, height: 1 } as const;

/** Every piece index of a grid, in reading order: left to right, top to bottom. */
export function pieceCount(grid: Grid): number {
  return grid.rows * grid.cols;
}

/**
 * Where a piece sits, as a fraction of the whole image.
 *
 * Fractions rather than pixels, because the board is zoomable: the same piece
 * has to be right at every scale, and a pixel offset computed at one zoom is
 * wrong at the next. These map straight onto `background-size` and
 * `background-position` for a window onto the master image.
 */
export interface PiecePlacement {
  row: number;
  col: number;
  /** 0–100, for `background-position`. A single-row or single-column grid has
   *  no travel on that axis, so the position is 0 rather than a division by 0. */
  xPercent: number;
  yPercent: number;
}

export function placePiece(index: number, grid: Grid): PiecePlacement {
  const row = Math.floor(index / grid.cols);
  const col = index % grid.cols;
  return {
    row,
    col,
    xPercent: grid.cols > 1 ? (col / (grid.cols - 1)) * 100 : 0,
    yPercent: grid.rows > 1 ? (row / (grid.rows - 1)) * 100 : 0,
  };
}

/** Whether an index names a piece of this grid at all. */
export function isPieceIndex(index: number, grid: Grid): boolean {
  return Number.isInteger(index) && index >= 0 && index < pieceCount(grid);
}
