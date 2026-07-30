import type { PurchaseResult, Tier } from "@sticker-collector/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, holding, sticker } from "../db/schema";
import { balance, PAID_FOR, spendStatement, stampCompletion } from "../lib/ledger";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";
import { liveAlbums } from "./albums";

export const purchaseRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

purchaseRoutes.use("*", requireAuth);

/**
 * Spending, in the only shape D1 allows.
 *
 * Every purchase is two statements in one batch: the conditional insert that
 * takes the coins, and the write that grants what was bought. The second is
 * gated on the first (`PAID_FOR`), because a conditional insert that matches
 * nothing does not fail — so without the gate an unaffordable purchase would
 * still hand over the goods (`lib/ledger.ts`).
 */

/**
 * POST /api/albums/:id/unlock
 *
 * No sticker inside a locked album may be bought, directly or at random
 * (`prd/04-albums.md` §Locked 4), so this is the gate on the whole album.
 */
purchaseRoutes.post("/:id/unlock", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const albumId = c.req.param("id");

  const row = await database
    .select({ id: album.id, unlockPrice: album.unlockPrice, unlockedAt: album.unlockedAt })
    .from(album)
    .where(and(eq(album.id, albumId), liveAlbums(userId)))
    .get();
  if (!row) return c.json({ error: "album not found" }, 404);
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
        reason: "album_unlock",
        albumId,
        createdAt: now,
      },
      // Re-checked at the moment of payment: a second request that got past the
      // read above must not be charged for an album already unlocked.
      { sql: "(SELECT unlocked_at FROM album WHERE id = ?) IS NULL", binds: [albumId] },
    ),
    c.env.DB.prepare(
      `UPDATE album SET unlocked_at = ?1 WHERE id = ?2 AND unlocked_at IS NULL AND ${PAID_FOR}`,
    ).bind(now, albumId, ledgerId),
  ]);

  if (charge?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const body: PurchaseResult = {
    balance: await balance(c.env.DB, userId),
    spentCoins: row.unlockPrice,
    albumId,
    stickerId: null,
    quantity: null,
  };
  return c.json(body, 201);
});

/**
 * POST /api/albums/:id/stickers/:stickerId/buy
 *
 * Direct purchase is the user's protection against bad luck: when one sticker
 * is missing, buying it outright beats pulling for it (`prd/05-stickers.md`
 * §Random 7). A sticker has no price of its own — it costs its tier's price,
 * in this album.
 */
purchaseRoutes.post("/:id/stickers/:stickerId/buy", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const albumId = c.req.param("id");
  const stickerId = c.req.param("stickerId");

  const row = await database
    .select({
      tier: sticker.tier,
      unlockedAt: album.unlockedAt,
      priceCommon: album.priceCommon,
      priceRare: album.priceRare,
      priceEpic: album.priceEpic,
      priceLegendary: album.priceLegendary,
    })
    .from(sticker)
    .innerJoin(album, eq(album.id, sticker.albumId))
    .where(and(eq(sticker.id, stickerId), eq(sticker.albumId, albumId), liveAlbums(userId)))
    .get();
  if (!row) return c.json({ error: "sticker not found" }, 404);
  if (!row.unlockedAt) return c.json({ error: "album is locked" }, 403);

  const owned = await database
    .select({ id: holding.id })
    .from(holding)
    .where(eq(holding.stickerId, stickerId))
    .get();
  if (owned) return c.json({ error: "already owned" }, 409);

  const price = priceFor(row, row.tier);
  const ledgerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const [charge] = await c.env.DB.batch([
    spendStatement(
      c.env.DB,
      {
        id: ledgerId,
        userId,
        amountCoins: -price,
        reason: "sticker_buy",
        albumId,
        stickerId,
        createdAt: now,
      },
      // Both conditions re-checked inside the payment: a locked album and an
      // already-owned sticker must cost nothing, whatever raced ahead of us.
      {
        sql: `(SELECT unlocked_at FROM album WHERE id = ?) IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM holding WHERE sticker_id = ?)`,
        binds: [albumId, stickerId],
      },
    ),
    c.env.DB.prepare(
      `INSERT INTO holding (id, sticker_id, quantity, first_acquired_at)
       SELECT ?1, ?2, 1, ?3 WHERE ${PAID_FOR}`,
    ).bind(crypto.randomUUID(), stickerId, now, ledgerId),
    // Buying the final slot is one of the two ways an album can be completed.
    stampCompletion(c.env.DB, albumId, ledgerId, now),
  ]);

  if (charge?.meta.changes !== 1) return c.json({ error: "insufficient coins" }, 402);

  const body: PurchaseResult = {
    balance: await balance(c.env.DB, userId),
    spentCoins: price,
    albumId,
    stickerId,
    quantity: 1,
  };
  return c.json(body, 201);
});

type Prices = {
  priceCommon: number;
  priceRare: number;
  priceEpic: number;
  priceLegendary: number;
};

function priceFor(prices: Prices, tier: Tier): number {
  switch (tier) {
    case "common":
      return prices.priceCommon;
    case "rare":
      return prices.priceRare;
    case "epic":
      return prices.priceEpic;
    case "legendary":
      return prices.priceLegendary;
  }
}
