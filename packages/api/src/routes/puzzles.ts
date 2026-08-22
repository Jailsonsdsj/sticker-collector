import { createPuzzleSchema, gridFor, type Puzzle } from "@sticker-collector/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { puzzle, puzzlePiece } from "../db/schema";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

/**
 * Puzzles: create, list, read. Buying is `puzzlePurchases.ts` (P9-05).
 *
 * Deletion is **soft**, and not by preference. `ledger.puzzle_id` is a foreign
 * key and the ledger is append-only by trigger, so the coins spent inside a
 * puzzle must stay spent and the row they point at has to survive. The same
 * constraint that makes album deletion soft.
 */
export const puzzleRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

puzzleRoutes.use("*", requireAuth);

/** The set a user can see: theirs, not deleted. */
export function livePuzzles(userId: string) {
  return and(eq(puzzle.userId, userId), isNull(puzzle.deletedAt));
}

type PuzzleRow = typeof puzzle.$inferSelect;

/** The row as the client reads it: 0/1 becomes a boolean, and the owned count
 *  travels with it because both the list and the board need it. */
function toPuzzle(row: PuzzleRow, ownedCount: number): Puzzle {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageKey: row.imageKey,
    unlockPrice: row.unlockPrice,
    piecePrice: row.piecePrice,
    rows: row.rows,
    cols: row.cols,
    hideLocked: row.hideLocked === 1,
    unlockedAt: row.unlockedAt,
    completedAt: row.completedAt,
    sealedAt: row.sealedAt,
    createdAt: row.createdAt,
    ownedCount,
  };
}

/**
 * POST /api/puzzles — create one, sealed.
 *
 * There is no separate seal step and there cannot be one: `puzzle_frozen`
 * blocks every change to the grid, the image and the prices the moment
 * `sealed_at` is set, and it is set here. A "create then configure" flow could
 * never write the second half.
 *
 * The author picks a piece **count**; the row stores the **grid**. Deriving it
 * once, here, means the board never has to agree with `gridFor()` at read time
 * — and a change to that function can never re-cut a puzzle that already has
 * pieces bought.
 */
puzzleRoutes.post("/", idempotency, async (c) => {
  const parsed = createPuzzleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad request", issues: parsed.error.issues }, 400);
  }

  const input = parsed.data;
  const grid = gridFor(input.pieces);
  const now = new Date().toISOString();

  const row: typeof puzzle.$inferInsert = {
    id: crypto.randomUUID(),
    userId: c.get("userId"),
    title: input.title,
    description: input.description ?? null,
    imageKey: input.imageKey,
    unlockPrice: input.unlockPrice,
    piecePrice: input.piecePrice,
    rows: grid.rows,
    cols: grid.cols,
    hideLocked: input.hideLocked ? 1 : 0,
    unlockedAt: null,
    completedAt: null,
    sealedAt: now,
    createdAt: now,
    deletedAt: null,
  };

  const created = await db(c.env).insert(puzzle).values(row).returning().get();
  // Nothing is written to `puzzle_piece`: absence of a row IS locked, so a new
  // puzzle owns nothing and the board derives every piece from the grid.
  return c.json(toPuzzle(created, 0), 201);
});

/**
 * GET /api/puzzles — the listing.
 *
 * The owned count comes from a grouped count rather than N queries: the Albums
 * tab shows every puzzle at once, and a query per row is the shape that gets
 * slow exactly when someone has enough puzzles to care.
 */
puzzleRoutes.get("/", async (c) => {
  const database = db(c.env);
  const rows = await database
    .select()
    .from(puzzle)
    .where(livePuzzles(c.get("userId")));

  const counts = new Map<string, number>();
  if (rows.length > 0) {
    // Joined and scoped rather than counting every piece row in the database.
    // The map lookup below would ignore the strays anyway, which is exactly why
    // it is worth being right here: a correct answer by accident stops being
    // correct the moment someone reuses the query.
    const owned = await database
      .select({ puzzleId: puzzlePiece.puzzleId, owned: sql<number>`COUNT(*)` })
      .from(puzzlePiece)
      .innerJoin(puzzle, eq(puzzle.id, puzzlePiece.puzzleId))
      .where(livePuzzles(c.get("userId")))
      .groupBy(puzzlePiece.puzzleId);
    for (const entry of owned) counts.set(entry.puzzleId, entry.owned);
  }

  return c.json(rows.map((row) => toPuzzle(row, counts.get(row.id) ?? 0)));
});

/**
 * GET /api/puzzles/:id — the board.
 *
 * Carries the owned indexes rather than a row per piece: the client already
 * knows the grid, and "which of these 144 are mine" is a list of small integers
 * against 144 objects with timestamps nobody draws.
 */
puzzleRoutes.get("/:id", async (c) => {
  const database = db(c.env);
  const id = c.req.param("id");

  const row = await database
    .select()
    .from(puzzle)
    .where(and(eq(puzzle.id, id), livePuzzles(c.get("userId"))))
    .get();
  if (!row) return c.json({ error: "puzzle not found" }, 404);

  const owned = await database
    .select({ pieceIndex: puzzlePiece.pieceIndex })
    .from(puzzlePiece)
    .where(eq(puzzlePiece.puzzleId, id));
  const ownedPieces = owned.map((piece) => piece.pieceIndex).sort((a, b) => a - b);

  return c.json({ ...toPuzzle(row, ownedPieces.length), ownedPieces });
});

/**
 * DELETE /api/puzzles/:id — soft, like an album.
 *
 * The row and its pieces stay; the coins they cost stay in the ledger, which
 * points at this id and cannot be rewritten.
 */
puzzleRoutes.delete("/:id", idempotency, async (c) => {
  const deleted = await db(c.env)
    .update(puzzle)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(puzzle.id, c.req.param("id")), livePuzzles(c.get("userId"))))
    .returning({ id: puzzle.id });

  if (deleted.length === 0) return c.json({ error: "puzzle not found" }, 404);
  return c.json({ deleted: deleted.length });
});
