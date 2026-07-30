import {
  canPullRandom,
  duplicateRefund,
  effectiveWeights,
  type PullResult,
  type SaleResult,
  TIERS,
  type Tier,
  type TierRecord,
  tierForRoll,
} from "@sticker-collector/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, holding, sticker } from "../db/schema";
import { balance, creditStatement, PAID_FOR, spendStatement, stampCompletion } from "../lib/ledger";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";
import { liveAlbums } from "./albums";

/**
 * The gamble, and its consolation.
 *
 * These two live together because the second exists only for the first: a
 * direct purchase refuses an owned sticker, so `quantity > 1` can only have
 * come from a random pull. "A duplicate obtained from a random purchase may be
 * sold" therefore needs no extra column to enforce — the quantity says it.
 *
 * All the arithmetic is A-01's. This file supplies entropy and rows.
 */
export const pullRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
export const stickerRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

pullRoutes.use("*", requireAuth);
stickerRoutes.use("*", requireAuth);

interface SlotRow {
  id: string;
  tier: Tier;
  quantity: number | null;
}

/**
 * POST /api/albums/:id/pull
 *
 * Two stages (`prd/05-stickers.md` §Random 2): a tier by the album's odds with
 * empty tiers excluded, then a sticker uniformly within it — **owned or not**.
 * A repeat is a duplicate, and duplicates are the price of gambling.
 */
pullRoutes.post("/:id/pull", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const albumId = c.req.param("id");

  const albumRow = await database
    .select({
      unlockedAt: album.unlockedAt,
      randomPrice: album.randomPrice,
      oddsCommon: album.oddsCommon,
      oddsRare: album.oddsRare,
      oddsEpic: album.oddsEpic,
      oddsLegendary: album.oddsLegendary,
    })
    .from(album)
    .where(and(eq(album.id, albumId), liveAlbums(userId)))
    .get();
  if (!albumRow) return c.json({ error: "album not found" }, 404);
  if (!albumRow.unlockedAt) return c.json({ error: "album is locked" }, 403);

  const slots: SlotRow[] = await database
    .select({ id: sticker.id, tier: sticker.tier, quantity: holding.quantity })
    .from(sticker)
    .leftJoin(holding, eq(holding.stickerId, sticker.id))
    .where(eq(sticker.albumId, albumId));

  const counts = tally(slots, () => true);
  const owned = tally(slots, (slot) => slot.quantity !== null);
  const odds: TierRecord<number> = {
    common: albumRow.oddsCommon,
    rare: albumRow.oddsRare,
    epic: albumRow.oddsEpic,
    legendary: albumRow.oddsLegendary,
  };
  const weights = effectiveWeights(odds, counts);

  // Reachability, not completion: a pull is refused whenever no *unowned*
  // sticker can come back, which covers the finished album as a special case.
  // Otherwise the user pays for a guaranteed duplicate (§Random 6).
  if (!canPullRandom({ weights, counts, owned })) {
    return c.json({ error: "no unowned sticker is reachable" }, 409);
  }

  const tier = tierForRoll(weights, randomFraction());
  if (!tier) return c.json({ error: "no unowned sticker is reachable" }, 409);

  const candidates = slots.filter((slot) => slot.tier === tier);
  const chosen = candidates[Math.floor(randomFraction() * candidates.length)] as SlotRow;

  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const [charge] = await c.env.DB.batch([
    spendStatement(
      c.env.DB,
      {
        id: ledgerId,
        userId,
        amountCoins: -albumRow.randomPrice,
        reason: "random_pull",
        albumId,
        stickerId: chosen.id,
        createdAt: now,
      },
      // Re-checked at the moment of payment, like every other guard read earlier.
      { sql: "(SELECT unlocked_at FROM album WHERE id = ?) IS NOT NULL", binds: [albumId] },
    ),
    // A repeat increments the copy rather than writing a second row — which is
    // what the UNIQUE index on sticker_id makes possible (migration 0003).
    c.env.DB.prepare(
      `INSERT INTO holding (id, sticker_id, quantity, first_acquired_at)
       SELECT ?1, ?2, 1, ?3 WHERE ${PAID_FOR}
       ON CONFLICT(sticker_id) DO UPDATE SET quantity = quantity + 1`,
    ).bind(crypto.randomUUID(), chosen.id, now, ledgerId),
    // A pull can fill the last slot too, and completion must not depend on
    // which of the two paths delivered it.
    stampCompletion(c.env.DB, albumId, ledgerId, now),
  ]);

  if (charge?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const quantity = (chosen.quantity ?? 0) + 1;
  const body: PullResult = {
    balance: await balance(c.env.DB, userId),
    spentCoins: albumRow.randomPrice,
    albumId,
    stickerId: chosen.id,
    tier,
    quantity,
    duplicate: quantity > 1,
    refundIfSold: duplicateRefund(albumRow.randomPrice),
  };
  return c.json(body, 201);
});

/**
 * POST /api/stickers/:id/sell
 *
 * Half the album's random-sticker price, floored — which is what makes a
 * duplicate a net loss under any values the user sets (`prd/01-coins.md`).
 *
 * The refund is written **first**, conditional on the copy being a spare, and
 * the decrement is gated on that refund existing. The other order would pay for
 * a decrement that might not happen; this one cannot pay without decrementing,
 * because both statements are conditional on the same fact inside one batch.
 */
stickerRoutes.post("/:id/sell", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const stickerId = c.req.param("id");

  const row = await database
    .select({ albumId: album.id, randomPrice: album.randomPrice, quantity: holding.quantity })
    .from(sticker)
    .innerJoin(album, eq(album.id, sticker.albumId))
    .leftJoin(holding, eq(holding.stickerId, sticker.id))
    .where(and(eq(sticker.id, stickerId), liveAlbums(userId)))
    .get();
  if (!row) return c.json({ error: "sticker not found" }, 404);
  if (row.quantity === null) return c.json({ error: "not owned" }, 404);

  const refund = duplicateRefund(row.randomPrice);
  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();
  const isSpare = "(SELECT quantity FROM holding WHERE sticker_id = ?) > 1";

  const [credit] = await c.env.DB.batch([
    creditStatement(
      c.env.DB,
      {
        id: ledgerId,
        userId,
        amountCoins: refund,
        reason: "duplicate_sale",
        albumId: row.albumId,
        stickerId,
        createdAt: now,
      },
      { sql: isSpare, binds: [stickerId] },
    ),
    // `PAID_FOR` is strictly redundant here — this statement repeats the
    // `quantity > 1` predicate the refund was conditional on, so the two cannot
    // disagree even under a concurrent sale. It stays so that *every* write
    // following a ledger row carries the same gate; on the purchase paths the
    // guard is a balance check that the second statement cannot express, and a
    // reader who dropped it there by analogy with here would hand out free
    // stickers.
    c.env.DB.prepare(
      `UPDATE holding SET quantity = quantity - 1 WHERE sticker_id = ?1 AND quantity > 1 AND ${PAID_FOR}`,
    ).bind(stickerId, ledgerId),
  ]);

  // Nothing written means the user holds a single copy, and the last copy is
  // not for sale — only duplicates are.
  if (credit?.meta.changes !== 1) return c.json({ error: "not a duplicate" }, 409);

  const body: SaleResult = {
    balance: await balance(c.env.DB, userId),
    refundedCoins: refund,
    stickerId,
    quantity: row.quantity - 1,
  };
  return c.json(body, 201);
});

function tally(slots: SlotRow[], include: (slot: SlotRow) => boolean): TierRecord<number> {
  const counts: TierRecord<number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const slot of slots) if (include(slot)) counts[slot.tier] += 1;
  return counts;
}

/** A uniform fraction in [0, 1) from the platform CSPRNG. */
function randomFraction(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] as number) / 0x1_0000_0000;
}

export { TIERS };
