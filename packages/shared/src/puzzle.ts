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
 * The factor pair for a count, shaped to the image.
 *
 * The stored puzzle image is square, so "shaped to the image" means "as close
 * to square as the count allows": the pair whose rows and cols are nearest each
 * other. 48 becomes 6×8 rather than 4×12, and 144 becomes a clean 12×12.
 *
 * Derived rather than stored as a table of five answers, so the reasoning is
 * visible and a sixth preset needs no second edit. Fewer rows than cols when
 * the pair is uneven, always — the choice has to be *a* choice, or the same
 * count would transpose between callers and a piece index would name a
 * different piece depending on who asked.
 *
 * **This assumes the master is square**, which `IMAGE_SIZES.puzzle` guarantees
 * and a test asserts. If that ever changes, this has to weigh the pair against
 * the real aspect instead of against each other.
 */
export function gridFor(pieces: number): Grid {
  let best: Grid = { rows: 1, cols: pieces };

  for (let rows = 1; rows * rows <= pieces; rows++) {
    if (pieces % rows !== 0) continue;
    const cols = pieces / rows;
    if (Math.abs(cols - rows) <= Math.abs(best.cols - best.rows)) best = { rows, cols };
  }

  return best;
}

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
