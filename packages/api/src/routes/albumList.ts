import {
  type AlbumDetail,
  type AlbumStatus,
  type AlbumSummary,
  albumQuerySchema,
  albumStatus,
  completionPercent,
  isAlmostThere,
  type OwnedSticker,
  slotsRemaining,
} from "@sticker-collector/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, holding, sticker } from "../db/schema";
import { balance } from "../lib/ledger";
import { requireAuth } from "../middleware/require-auth";
import { liveAlbums, toAlbum } from "./albums";

export const albumListRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

albumListRoutes.use("*", requireAuth);

type AlbumRow = typeof album.$inferSelect;

/**
 * Owned and total slots, counted in the same query as the album.
 *
 * A count per album would be an N+1 that is invisible with three albums and
 * fatal with thirty inside a 10 ms CPU budget. These are correlated subqueries,
 * so the whole listing is one round trip.
 */
const totalSlots = sql<number>`(SELECT COUNT(*) FROM sticker WHERE sticker.album_id = album.id)`;
const ownedSlots = sql<number>`(
  SELECT COUNT(*) FROM holding
  JOIN sticker ON sticker.id = holding.sticker_id
  WHERE sticker.album_id = album.id
)`;

/**
 * GET /api/albums?status&sort
 *
 * Locked and unlocked albums live in one section — there is no store
 * (`prd/04-albums.md` §2). Status filters; sort only reorders.
 */
albumListRoutes.get("/", async (c) => {
  const parsed = albumQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "bad request", issues: parsed.error.issues }, 400);

  const userId = c.get("userId");
  const rows = await db(c.env)
    .select({ album, total: totalSlots, owned: ownedSlots })
    .from(album)
    .where(liveAlbums(userId));

  // The balance is read once for the whole listing, not once per album — the
  // affordability cue answers "what can I afford right now" without arithmetic
  // (§Enhancements), and it is the same number for every row.
  const coins = await balance(c.env.DB, userId);

  const albums = rows
    .map((row) => summarise(row.album, row.owned, row.total, coins))
    .filter((entry) => !parsed.data.status || entry.status === parsed.data.status)
    .sort(comparator(parsed.data.sort));

  return c.json(albums);
});

/**
 * GET /api/albums/:id
 *
 * The whole grid, including the slots that are still empty: a locked sticker
 * has to render its rarity frame before it is owned, so an unowned slot comes
 * back with `quantity: 0` rather than being left out.
 *
 * Browsing a locked album is permitted — buying inside one is not (§5).
 */
albumListRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const albumId = c.req.param("id");
  const database = db(c.env);

  const row = await database
    .select({ album, total: totalSlots, owned: ownedSlots })
    .from(album)
    .where(and(eq(album.id, albumId), liveAlbums(userId)))
    .get();
  if (!row) return c.json({ error: "album not found" }, 404);

  const slots = await database
    .select({
      id: sticker.id,
      albumId: sticker.albumId,
      imageKey: sticker.imageKey,
      tier: sticker.tier,
      slotIndex: sticker.slotIndex,
      quantity: holding.quantity,
    })
    .from(sticker)
    .leftJoin(holding, eq(holding.stickerId, sticker.id))
    .where(eq(sticker.albumId, albumId))
    .orderBy(sticker.slotIndex);

  const stickers: OwnedSticker[] = slots.map((slot) => ({
    id: slot.id,
    albumId: slot.albumId,
    imageKey: slot.imageKey,
    tier: slot.tier,
    slotIndex: slot.slotIndex,
    quantity: slot.quantity ?? 0,
  }));

  const body: AlbumDetail = {
    album: summarise(row.album, row.owned, row.total, await balance(c.env.DB, userId)),
    stickers,
  };
  return c.json(body);
});

function summarise(row: AlbumRow, owned: number, total: number, coins: number): AlbumSummary {
  const status = albumStatus({ unlocked: row.unlockedAt !== null, owned, total });
  return {
    ...toAlbum(row),
    owned,
    total,
    percent: completionPercent(owned, total),
    status,
    remaining: slotsRemaining(owned, total),
    almostThere: status !== "locked" && isAlmostThere(owned, total),
    affordable: status === "locked" && row.unlockPrice <= coins,
  };
}

/** Sorting only reorders; it never hides an album (§3). */
const STATUS_ORDER: Record<AlbumStatus, number> = { in_progress: 0, locked: 1, completed: 2 };

function comparator(sort: "status" | "title" | "progress" | "created") {
  return (a: AlbumSummary, b: AlbumSummary): number => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title);
      case "progress":
        // Fullest first, and an album one slot from done outranks a fuller
        // percentage on a bigger album only if its percentage is higher.
        return b.percent - a.percent || a.title.localeCompare(b.title);
      case "created":
        return b.createdAt.localeCompare(a.createdAt);
      case "status":
        return (
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          b.percent - a.percent ||
          a.title.localeCompare(b.title)
        );
    }
  };
}
