// The wallet is the ledger's running sum — never a stored column (architecture.md §4.1).
// Spending is a conditional insert whose balance check lives inside the SQL WHERE, so
// two concurrent requests can't both overspend (§4.3). Money is integer coins.

// Only debits go through spend(). Earning (task_reward) is a plain append handled elsewhere.
export type SpendReason = "album_unlock" | "sticker_buy" | "random_pull";

export interface SpendInput {
  id: string;
  userId: string;
  amountCoins: number; // negative — the amount to debit
  reason: SpendReason;
  occurrenceId?: string;
  albumId?: string;
  stickerId?: string;
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

// Appends a debit ledger row ONLY if the balance covers it. The guard is the WHERE
// clause, evaluated atomically inside the insert — `meta.changes === 0` means the
// funds weren't there and nothing was written (the caller returns 402).
export async function spend(db: D1Database, input: SpendInput): Promise<{ ok: boolean }> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO ledger (id, user_id, amount_coins, reason, occurrence_id, album_id, sticker_id, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
       WHERE (SELECT COALESCE(SUM(amount_coins), 0) FROM ledger WHERE user_id = ?2) >= ABS(?3)`,
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
    )
    .run();

  return { ok: result.meta.changes === 1 };
}
