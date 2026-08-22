// The wallet is the ledger's running sum — never a stored column (architecture.md §4.1).
// Spending is a conditional insert whose balance check lives inside the SQL WHERE, so
// two concurrent requests can't both overspend (§4.3). Money is integer coins.

// Only debits go through spend().
export type SpendReason =
  | "album_unlock"
  | "sticker_buy"
  | "random_pull"
  | "puzzle_unlock"
  | "piece_unlock";

/**
 * Credits: coins arriving rather than leaving. A refund must NOT go through
 * `spend()` — its `balance >= ABS(amount)` guard is right for a debit and
 * actively wrong here, where it would demand the user already hold the coins
 * they are about to be paid.
 */
export type CreditReason = "task_reward" | "duplicate_sale";

export interface SpendInput {
  id: string;
  userId: string;
  amountCoins: number; // negative — the amount to debit
  reason: SpendReason;
  occurrenceId?: string;
  albumId?: string;
  stickerId?: string;
  puzzleId?: string;
  createdAt?: string;
}

// Current balance = SUM of the user's ledger. Returns 0 for an empty ledger.
export async function balance(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(amount_coins), 0) AS bal FROM ledger WHERE user_id = ?")
    .bind(userId)
    .first<{ bal: number }>();
  return row?.bal ?? 0;
}

/**
 * Extra conditions folded into the spend's WHERE clause, so a guard that must
 * hold *at the moment of payment* is checked by the database rather than by a
 * read that happened earlier. Binds start at ?10 — the spend itself uses ?1–?9.
 */
export interface SpendGuard {
  sql: string;
  binds: unknown[];
}

/**
 * The conditional insert as a prepared statement, so a spend can be composed
 * into a `db.batch([...])` alongside whatever the money buys.
 *
 * Composing matters: D1 has no interactive transaction, and a batch is the only
 * way to make "take the coins" and "grant the thing" succeed or fail together.
 */
export function spendStatement(
  db: D1Database,
  input: SpendInput,
  guard?: SpendGuard,
): D1PreparedStatement {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const extra = guard ? ` AND ${guard.sql}` : "";

  return db
    .prepare(
      `INSERT INTO ledger (id, user_id, amount_coins, reason, occurrence_id, album_id, sticker_id, puzzle_id, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
       WHERE (SELECT COALESCE(SUM(amount_coins), 0) FROM ledger WHERE user_id = ?2) >= ABS(?3)${extra}`,
    )
    .bind(
      input.id,
      input.userId,
      input.amountCoins,
      input.reason,
      input.occurrenceId ?? null,
      input.albumId ?? null,
      input.stickerId ?? null,
      input.puzzleId ?? null,
      createdAt,
      ...(guard?.binds ?? []),
    );
}

/**
 * A credit as a prepared statement, for composing into a batch.
 *
 * There is no balance check — coins are arriving. The guard, when there is one,
 * is about whether the credit is *earned*: selling a duplicate passes
 * "this holding has more than one copy", so the refund and the decrement are
 * conditional on the same fact and cannot disagree.
 */
export function creditStatement(
  db: D1Database,
  input: Omit<SpendInput, "reason"> & { reason: CreditReason },
  guard?: SpendGuard,
): D1PreparedStatement {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const where = guard ? `WHERE ${guard.sql}` : "";

  return db
    .prepare(
      `INSERT INTO ledger (id, user_id, amount_coins, reason, occurrence_id, album_id, sticker_id, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 ${where}`,
    )
    .bind(
      input.id,
      input.userId,
      input.amountCoins,
      input.reason,
      input.occurrenceId ?? null,
      input.albumId ?? null,
      input.stickerId ?? null,
      createdAt,
      ...(guard?.binds ?? []),
    );
}

/**
 * Appends a debit ledger row ONLY if the balance covers it. The guard is the
 * WHERE clause, evaluated atomically inside the insert — `meta.changes === 0`
 * means the funds weren't there and nothing was written (the caller returns 402).
 */
export async function spend(db: D1Database, input: SpendInput): Promise<{ ok: boolean }> {
  const result = await spendStatement(db, input).run();
  return { ok: result.meta.changes === 1 };
}

/**
 * The gate every write that *follows* a spend must carry.
 *
 * `architecture.md` §4.3 says a batch is "rolled back" when the conditional
 * insert changes 0 rows. It is not: matching nothing is a **successful**
 * statement, D1 raises no error, and the next statement in the batch lands
 * anyway — which would hand a broke user the sticker for free. Making the
 * follow-up depend on the ledger row's existence is what actually ties them
 * together, and it works because the batch is one transaction, so this sees the
 * row the previous statement just wrote.
 */
export const PAID_FOR = "EXISTS (SELECT 1 FROM ledger WHERE id = ?)";

/**
 * Stamps an album complete the first time it hits 100%.
 *
 * Belongs in the same batch as the purchase that filled the last slot: the
 * album is complete the instant that holding exists, and any later moment is a
 * write on a read path with no idempotency behind it.
 *
 * `completed_at IS NULL` is what makes "exactly once" structural rather than
 * incidental. Today it is strictly unreachable: a complete album has every
 * sticker owned, so a direct buy 409s and a pull 409s, and no purchase can
 * reach this statement a second time. It stays because that reachability is an
 * accident of two guards in other files — the day someone allows re-buying an
 * owned sticker, this clause is the only thing keeping the completion date from
 * silently sliding to the present.
 *
 * The `total > 0` term is the guard against an album with no stickers
 * satisfying `owned = total` and declaring itself finished.
 */
export function stampCompletion(
  db: D1Database,
  albumId: string,
  ledgerId: string,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE album SET completed_at = ?1
       WHERE id = ?2
         AND completed_at IS NULL
         AND (SELECT COUNT(*) FROM sticker WHERE sticker.album_id = ?2) > 0
         AND (SELECT COUNT(*) FROM sticker WHERE sticker.album_id = ?2) =
             (SELECT COUNT(*) FROM holding
                JOIN sticker ON sticker.id = holding.sticker_id
               WHERE sticker.album_id = ?2)
         AND ${PAID_FOR}`,
    )
    .bind(now, albumId, ledgerId);
}
