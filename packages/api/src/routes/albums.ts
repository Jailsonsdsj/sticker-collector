import {
  type Album,
  type CreateAlbum,
  createAlbumSchema,
  type SealedAlbum,
  type Sticker,
  shuffleOrder,
  TIERS,
  type TierRecord,
} from "@sticker-collector/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, sticker } from "../db/schema";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

type AlbumRow = typeof album.$inferSelect;

/**
 * The albums a user still has.
 *
 * Every read and every spend path filters through this. A deleted album that
 * stayed reachable from even one of them would let coins be spent inside
 * something the user believes is gone.
 */
export function liveAlbums(userId: string) {
  return and(eq(album.userId, userId), isNull(album.deletedAt));
}
type StickerRow = typeof sticker.$inferSelect;

export const albumRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

albumRoutes.use("*", requireAuth);
// Idempotency is attached to the route, never to a wildcard: `purchases.ts`
// mounts on this same prefix, and a wildcard here would claim the key for its
// requests too — the second middleware would then see an in-flight claim of its
// own and 409 every purchase.

/**
 * POST /api/albums — create an album and seal it.
 *
 * There is no separate seal step, and there cannot be one: `sticker_frozen`
 * blocks every update to a sticker row, so a "create then add stickers" flow
 * could never write the second half of the set. The whole album arrives at
 * once and the wizard holds draft state client-side until it does
 * (`prd/04-albums.md` §Sealing 11).
 *
 * Album row and sticker rows go in a single `db.batch([...])`. D1 has no
 * interactive transaction, so that batch is the only thing standing between a
 * failed insert and an album that exists with half its stickers.
 */
albumRoutes.post("/", idempotency, async (c) => {
  const parsed = createAlbumSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad request", issues: parsed.error.issues }, 400);
  }

  const input: CreateAlbum = parsed.data;
  const database = db(c.env);
  const userId = c.get("userId");

  // A new edition continues the source album's chain. The source itself is
  // never touched — it keeps its stickers, its ownership and its exports.
  let editionNumber = 1;
  if (input.derivedFromAlbumId) {
    const source = await database
      .select({ editionNumber: album.editionNumber })
      .from(album)
      .where(and(eq(album.id, input.derivedFromAlbumId), liveAlbums(userId)))
      .get();
    if (!source) return c.json({ error: "source album not found" }, 404);
    editionNumber = source.editionNumber + 1;
  }

  const now = new Date().toISOString();
  const albumId = crypto.randomUUID();

  const albumRow: typeof album.$inferInsert = {
    id: albumId,
    userId,
    title: input.title,
    description: input.description ?? null,
    coverKey: input.coverKey,
    derivedFromAlbumId: input.derivedFromAlbumId ?? null,
    unlockPrice: input.unlockPrice,
    randomPrice: input.randomPrice,
    priceCommon: input.prices.common,
    priceRare: input.prices.rare,
    priceEpic: input.prices.epic,
    priceLegendary: input.prices.legendary,
    oddsCommon: input.odds.common,
    oddsRare: input.odds.rare,
    oddsEpic: input.odds.epic,
    oddsLegendary: input.odds.legendary,
    hideLocked: input.hideLocked ? 1 : 0,
    lockedCoverKey: input.lockedCoverKey ?? null,
    // Locked and incomplete: every sticker must be earned and bought, even in a
    // new edition of an album that was already finished (§Creating from existing 5).
    unlockedAt: null,
    completedAt: null,
    sealedAt: now,
    createdAt: now,
    editionNumber,
  };

  // The slot order is drawn once, here, and stored. It is not re-shuffled on
  // every view, and the print export reads the same order (§Creating 10).
  const order = shuffleOrder(input.stickers.length, randomFraction);
  const stickerRows: (typeof sticker.$inferInsert)[] = input.stickers.map((entry, index) => ({
    id: crypto.randomUUID(),
    albumId,
    imageKey: entry.imageKey,
    title: entry.title ?? null,
    description: entry.description ?? null,
    tier: entry.tier,
    slotIndex: order[index] as number,
  }));

  // One batch: either the album and all of its stickers exist, or none do.
  //
  // The stickers are chunked because **D1 binds at most 100 parameters per
  // statement**, and a sticker row binds 5 — so a single multi-row INSERT
  // silently caps an album at 20 stickers and 500s on the 21st. Chunking splits
  // the statements, not the transaction: every chunk is in the same batch, so
  // the atomicity above is unchanged.
  const statements = [
    database.insert(album).values(albumRow),
    ...chunk(stickerRows, STICKER_ROWS_PER_STATEMENT).map((rows) =>
      database.insert(sticker).values(rows),
    ),
    // `batch` is typed as a non-empty tuple; the album insert guarantees that,
    // but the compiler cannot see it through the spread.
  ] as unknown as Parameters<typeof database.batch>[0];

  await database.batch(statements);

  const body: SealedAlbum = {
    album: toAlbum(albumRow as AlbumRow),
    stickers: stickerRows.map((row) => toSticker(row as StickerRow)),
  };
  return c.json(body, 201);
});

/**
 * D1 binds at most 100 parameters per statement.
 *
 * A sticker row binds **7** — id, albumId, imageKey, title, description, tier,
 * slotIndex — so fourteen rows is the largest INSERT that will run. This number
 * is a function of the column count and has to move with it: it was 20 when the
 * row bound 5, and adding title/description without changing it would have
 * silently capped an album at 14 stickers and 500d on the 15th (TD-15, again).
 */
const STICKER_ROWS_PER_STATEMENT = 14;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A uniform fraction in [0, 1) from the platform CSPRNG. */
function randomFraction(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] as number) / 0x1_0000_0000;
}

function perTier(row: AlbumRow, field: "price" | "odds"): TierRecord<number> {
  const columns =
    field === "price"
      ? ([row.priceCommon, row.priceRare, row.priceEpic, row.priceLegendary] as const)
      : ([row.oddsCommon, row.oddsRare, row.oddsEpic, row.oddsLegendary] as const);
  return {
    common: columns[0],
    rare: columns[1],
    epic: columns[2],
    legendary: columns[3],
  };
}

export function toAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverKey: row.coverKey,
    derivedFromAlbumId: row.derivedFromAlbumId,
    unlockPrice: row.unlockPrice,
    randomPrice: row.randomPrice,
    prices: perTier(row, "price"),
    odds: perTier(row, "odds"),
    // D1 has no boolean; the column is 0/1 and the API speaks true/false.
    hideLocked: row.hideLocked === 1,
    lockedCoverKey: row.lockedCoverKey,
    unlockedAt: row.unlockedAt,
    completedAt: row.completedAt,
    sealedAt: row.sealedAt,
    createdAt: row.createdAt,
    editionNumber: row.editionNumber,
  };
}

export function toSticker(row: StickerRow): Sticker {
  return {
    id: row.id,
    albumId: row.albumId,
    imageKey: row.imageKey,
    title: row.title,
    description: row.description,
    tier: row.tier,
    slotIndex: row.slotIndex,
  };
}

/** Re-exported so A-04/A-05 use the same tier ordering when they aggregate. */
export { TIERS };

/**
 * DELETE /api/albums/:id
 *
 * Destructive from the user's side: the album, its stickers and every coin
 * spent inside it are gone, and nothing is refunded (`prd/04-albums.md`
 * §Deleting 1).
 *
 * Soft, because it has to be. `ledger.album_id` is a foreign key and the ledger
 * is append-only by trigger, so the spend rows can neither be removed nor
 * repointed — the album row must outlive the album. What the user loses is
 * every way of reaching it.
 */
albumRoutes.delete("/:id", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const albumId = c.req.param("id");

  const deleted = await database
    .update(album)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(album.id, albumId), liveAlbums(userId)))
    .returning({ id: album.id });

  if (deleted.length === 0) return c.json({ error: "album not found" }, 404);
  return c.json({ deleted: albumId });
});
