import {
  isPieceIndex,
  MAX_PIECES_PER_UNLOCK,
  type PuzzlePurchase,
  unlockPiecesSchema,
} from "@sticker-collector/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { puzzle, puzzlePiece } from "../db/schema";
import { balance, PAID_FOR, spendStatement } from "../lib/ledger";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";
import { livePuzzles } from "./puzzles";

/**
 * Spending inside a puzzle, in the only shape D1 allows.
 *
 * Every purchase is one batch: the conditional insert that takes the coins,
 * then the writes that grant what was bought, each gated on `PAID_FOR`. A
 * conditional insert that matches nothing does not *fail* — so without the gate
 * an unaffordable purchase would still hand over the pieces.
 */
export const puzzlePurchaseRoutes = new Hono<{
  Bindings: Env;
  Variables: { userId: string };
}>();

puzzlePurchaseRoutes.use("*", requireAuth);

/**
 * POST /api/puzzles/:id/unlock
 *
 * No piece may be bought inside a locked puzzle, so this is the gate on the
 * whole thing — the same shape as an album's unlock.
 */
puzzlePurchaseRoutes.post("/:id/unlock", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const puzzleId = c.req.param("id");

  const row = await database
    .select({ unlockPrice: puzzle.unlockPrice, unlockedAt: puzzle.unlockedAt })
    .from(puzzle)
    .where(and(eq(puzzle.id, puzzleId), livePuzzles(userId)))
    .get();
  if (!row) return c.json({ error: "puzzle not found" }, 404);
  if (row.unlockedAt) return c.json({ error: "already unlocked" }, 409);

  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const [charge] = await c.env.DB.batch([
    spendStatement(
      c.env.DB,
      {
        id: ledgerId,
        userId,
        amountCoins: -row.unlockPrice,
        reason: "puzzle_unlock",
        puzzleId,
        createdAt: now,
      },
      // Re-checked at the moment of payment: a second request that got past the
      // read above must not be charged for a puzzle already open.
      { sql: "(SELECT unlocked_at FROM puzzle WHERE id = ?) IS NULL", binds: [puzzleId] },
    ),
    c.env.DB.prepare(
      `UPDATE puzzle SET unlocked_at = ?1 WHERE id = ?2 AND unlocked_at IS NULL AND ${PAID_FOR}`,
    ).bind(now, puzzleId, ledgerId),
  ]);

  if (charge?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const body: PuzzlePurchase = {
    balance: await balance(c.env.DB, userId),
    spentCoins: row.unlockPrice,
    puzzleId,
    pieces: [],
    completed: false,
  };
  return c.json(body, 201);
});

/**
 * POST /api/puzzles/:id/pieces — buy a selection, as one payment.
 *
 * All of it or none of it. The sum is charged once and every piece is written
 * in the same batch, gated on that payment, because a partial success here is
 * the worst outcome available: coins gone and a picture still full of holes,
 * with no record of which pieces were meant to be in it.
 *
 * The count is capped so the batch stays a size D1 handles. Chunking would be
 * the alternative and it is worse: two batches cannot fail together.
 */
puzzlePurchaseRoutes.post("/:id/pieces", idempotency, async (c) => {
  const parsed = unlockPiecesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad request", issues: parsed.error.issues }, 400);
  }

  const database = db(c.env);
  const userId = c.get("userId");
  const puzzleId = c.req.param("id");

  const row = await database
    .select({
      piecePrice: puzzle.piecePrice,
      rows: puzzle.rows,
      cols: puzzle.cols,
      unlockedAt: puzzle.unlockedAt,
    })
    .from(puzzle)
    .where(and(eq(puzzle.id, puzzleId), livePuzzles(userId)))
    .get();
  if (!row) return c.json({ error: "puzzle not found" }, 404);
  if (!row.unlockedAt) return c.json({ error: "puzzle is locked" }, 409);

  const grid = { rows: row.rows, cols: row.cols };
  const wanted = parsed.data.pieces;
  if (wanted.some((index) => !isPieceIndex(index, grid))) {
    return c.json({ error: "no such piece" }, 400);
  }
  if (wanted.length > MAX_PIECES_PER_UNLOCK) {
    return c.json({ error: "too many pieces at once" }, 400);
  }

  // Already-owned pieces are dropped rather than refused. Two taps racing on a
  // flaky connection is a normal thing to do, and charging for a piece that is
  // already yours is the one outcome that cannot be undone.
  const owned = new Set(
    (
      await database
        .select({ pieceIndex: puzzlePiece.pieceIndex })
        .from(puzzlePiece)
        .where(eq(puzzlePiece.puzzleId, puzzleId))
    ).map((piece) => piece.pieceIndex),
  );
  const buying = wanted.filter((index) => !owned.has(index));
  if (buying.length === 0) return c.json({ error: "already owned" }, 409);

  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();
  const cost = row.piecePrice * buying.length;

  const results = await c.env.DB.batch([
    spendStatement(c.env.DB, {
      id: ledgerId,
      userId,
      amountCoins: -cost,
      reason: "piece_unlock",
      puzzleId,
      createdAt: now,
    }),
    ...buying.map((index) =>
      c.env.DB.prepare(
        `INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at)
         SELECT ?1, ?2, ?3, ?4 WHERE ${PAID_FOR}`,
      ).bind(crypto.randomUUID(), puzzleId, index, now, ledgerId),
    ),
    // Complete in the same batch as the purchase that filled the last hole: the
    // puzzle is finished the instant that row exists, and any later moment is a
    // write on a read path with no idempotency behind it.
    c.env.DB.prepare(
      `UPDATE puzzle SET completed_at = ?1
         WHERE id = ?2
           AND completed_at IS NULL
           AND (SELECT COUNT(*) FROM puzzle_piece WHERE puzzle_id = ?2) = rows * cols
           AND ${PAID_FOR}`,
    ).bind(now, puzzleId, ledgerId),
  ]);

  if (results[0]?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const completed = (results[results.length - 1]?.meta.changes ?? 0) === 1;
  const body: PuzzlePurchase = {
    balance: await balance(c.env.DB, userId),
    spentCoins: cost,
    puzzleId,
    pieces: [...buying].sort((a, b) => a - b),
    completed,
  };
  return c.json(body, 201);
});

/**
 * POST /api/puzzles/:id/pieces/random — the gamble.
 *
 * The album's rule, in a place with no tiers: *a pull is refused whenever no
 * unowned thing can come back*, because otherwise the user pays for a
 * guaranteed nothing (`prd/05-stickers.md` §Random 6).
 *
 * Where the album applies that per tier and still allows a duplicate — the
 * gamble is which sticker, and a repeat pays a refund — a puzzle piece has no
 * duplicate to give. `puzzle_piece` is UNIQUE on (puzzle, index) and there is
 * no refund to soften it, so the draw is from the **locked pieces only** and an
 * exhausted puzzle is a 409 rather than a sale. That is the same rule reaching
 * the same end by the only route open to it.
 *
 * The entropy is the Worker's, never the client's: a caller that chose its own
 * piece would be buying a named one at the random price.
 */
puzzlePurchaseRoutes.post("/:id/pieces/random", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const puzzleId = c.req.param("id");

  const row = await database
    .select({
      randomPrice: puzzle.randomPrice,
      rows: puzzle.rows,
      cols: puzzle.cols,
      unlockedAt: puzzle.unlockedAt,
    })
    .from(puzzle)
    .where(and(eq(puzzle.id, puzzleId), livePuzzles(userId)))
    .get();
  if (!row) return c.json({ error: "puzzle not found" }, 404);
  if (!row.unlockedAt) return c.json({ error: "puzzle is locked" }, 409);
  // Zero is "the author did not offer one", not "free". A free gamble is not a
  // gamble, which is why the schema floors a declared price at 1.
  if (row.randomPrice < 1) return c.json({ error: "no random pull on this puzzle" }, 409);

  const owned = new Set(
    (
      await database
        .select({ pieceIndex: puzzlePiece.pieceIndex })
        .from(puzzlePiece)
        .where(eq(puzzlePiece.puzzleId, puzzleId))
    ).map((piece) => piece.pieceIndex),
  );

  const locked: number[] = [];
  for (let index = 0; index < row.rows * row.cols; index++) {
    if (!owned.has(index)) locked.push(index);
  }
  if (locked.length === 0) return c.json({ error: "every piece is already yours" }, 409);

  const chosen = locked[Math.floor(randomFraction() * locked.length)] as number;
  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const results = await c.env.DB.batch([
    spendStatement(
      c.env.DB,
      {
        id: ledgerId,
        userId,
        amountCoins: -row.randomPrice,
        reason: "piece_unlock",
        puzzleId,
        createdAt: now,
      },
      // Re-checked at the moment of payment: a second request that got past the
      // read above must not buy a piece that has since been bought.
      {
        sql: "NOT EXISTS (SELECT 1 FROM puzzle_piece WHERE puzzle_id = ? AND piece_index = ?)",
        binds: [puzzleId, chosen],
      },
    ),
    c.env.DB.prepare(
      `INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at)
       SELECT ?1, ?2, ?3, ?4 WHERE ${PAID_FOR}`,
    ).bind(crypto.randomUUID(), puzzleId, chosen, now, ledgerId),
    c.env.DB.prepare(
      `UPDATE puzzle SET completed_at = ?1
         WHERE id = ?2
           AND completed_at IS NULL
           AND (SELECT COUNT(*) FROM puzzle_piece WHERE puzzle_id = ?2) = rows * cols
           AND ${PAID_FOR}`,
    ).bind(now, puzzleId, ledgerId),
  ]);

  if (results[0]?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const body: PuzzlePurchase = {
    balance: await balance(c.env.DB, userId),
    spentCoins: row.randomPrice,
    puzzleId,
    pieces: [chosen],
    completed: (results[results.length - 1]?.meta.changes ?? 0) === 1,
  };
  return c.json(body, 201);
});

/** Entropy, the same shape the album's pull uses. */
function randomFraction(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] as number) / 0x1_0000_0000;
}
