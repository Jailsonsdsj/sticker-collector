import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// one row, effectively; user_id exists so a second person is a migration, not a rewrite.
// passphrase_hash -> auth_key_hash + kdf_salt + kdf_iterations: the KDF runs client-side (architecture.md §0.2).
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  authKeyHash: text("auth_key_hash").notNull(),
  kdfSalt: text("kdf_salt").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  timezone: text("timezone").notNull(),
  createdAt: text("created_at").notNull(),
});

// sealed on create. economic columns are write-once (enforced by the album_sealed_frozen trigger).
export const album = sqliteTable(
  "album",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    coverKey: text("cover_key").notNull(),
    derivedFromAlbumId: text("derived_from_album_id").references((): AnySQLiteColumn => album.id),
    unlockPrice: integer("unlock_price").notNull(),
    randomPrice: integer("random_price").notNull(),
    priceCommon: integer("price_common").notNull(),
    priceRare: integer("price_rare").notNull(),
    priceEpic: integer("price_epic").notNull(),
    priceLegendary: integer("price_legendary").notNull(),
    oddsCommon: integer("odds_common").notNull(),
    oddsRare: integer("odds_rare").notNull(),
    oddsEpic: integer("odds_epic").notNull(),
    oddsLegendary: integer("odds_legendary").notNull(),
    /**
     * Hide what has not been collected yet.
     *
     * With this set, an unowned slot shows `lockedCoverKey` (or a "?") instead
     * of the sticker's own art under a grayscale filter — so the album keeps
     * its surprises. Stored as 0/1: D1 has no boolean.
     */
    hideLocked: integer("hide_locked").notNull().default(0),
    /** One stand-in image for every locked slot, like the back of a card. */
    lockedCoverKey: text("locked_cover_key"),
    unlockedAt: text("unlocked_at"),
    completedAt: text("completed_at"),
    sealedAt: text("sealed_at").notNull(),
    createdAt: text("created_at").notNull(),
    // Soft, and not by preference: `ledger.album_id` is a foreign key and the
    // coins spent inside a deleted album must stay spent, so those rows have to
    // survive. Nulling their columns first is blocked by `ledger_no_update`.
    // Removing the row is therefore impossible without breaking an invariant.
    deletedAt: text("deleted_at"),
    // makes the edition chain readable without recursion (architecture.md §4.5).
    editionNumber: integer("edition_number").notNull().default(1),
  },
  (table) => [
    check(
      "album_odds_sum_100",
      sql`${table.oddsCommon} + ${table.oddsRare} + ${table.oddsEpic} + ${table.oddsLegendary} = 100`,
    ),
  ],
);

// immutable set, fixed at seal (enforced by the sticker_frozen trigger); slot_index is the shuffled print/display order.
export const sticker = sqliteTable(
  "sticker",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => album.id),
    imageKey: text("image_key").notNull(),
    // Optional, author-written, and frozen with the rest of the row by
    // `sticker_frozen` — a sticker's name and note are part of what was sealed.
    title: text("title"),
    description: text("description"),
    tier: text("tier", { enum: ["common", "rare", "epic", "legendary"] }).notNull(),
    slotIndex: integer("slot_index").notNull(),
  },
  (table) => [unique("sticker_album_slot_unique").on(table.albumId, table.slotIndex)],
);

export const epic = sqliteTable("epic", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull(),
  /** Optional, author-written: what this epic is actually for. */
  description: text("description"),
  accent: text("accent").notNull(),
  /** active | next | achieved. Defaulted so existing rows stay where they are. */
  status: text("status").notNull().default("active"),
  coinGoalAlbumId: text("coin_goal_album_id").references(() => album.id),
  createdAt: text("created_at").notNull(),
});

// the routine/one-off DEFINITION. never stores future occurrences.
export const task = sqliteTable(
  "task",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    epicId: text("epic_id").references(() => epic.id),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    effortMinutes: integer("effort_minutes").notNull(),
    rewardCoins: integer("reward_coins").notNull(),
    priority: text("priority", { enum: ["low", "medium", "high"] }).notNull(),
    type: text("type", { enum: ["routine", "oneoff"] }).notNull(),
    weekdays: integer("weekdays"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    dueAt: text("due_at"),
    // The local day this task was pinned to, or null. A DATE rather than a
    // boolean so the pin expires by itself: pinned for today is a statement
    // about today, and tomorrow it should stop being true without anyone
    // having to remember to clear it.
    pinnedOn: text("pinned_on"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("task_user_type_deleted_idx").on(table.userId, table.type, table.deletedAt)],
);

// materialized lazily, one per completed-or-touched scheduled day (architecture.md §0.3).
export const occurrence = sqliteTable(
  "occurrence",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id),
    scheduledOn: text("scheduled_on").notNull(),
    status: text("status", { enum: ["pending", "done", "missed", "archived"] }).notNull(),
    completedAt: text("completed_at"),
    // frozen at completion, never recomputed (enforced by the occurrence_snapshot_write_once trigger).
    rewardSnapshotCoins: integer("reward_snapshot_coins"),
  },
  (table) => [unique("occurrence_task_scheduled_unique").on(table.taskId, table.scheduledOn)],
);

// the single source of truth for the wallet. append-only (enforced by the ledger_no_update/ledger_no_delete triggers).
export const ledger = sqliteTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    amountCoins: integer("amount_coins").notNull(),
    reason: text("reason", {
      enum: ["task_reward", "album_unlock", "sticker_buy", "random_pull", "duplicate_sale"],
    }).notNull(),
    occurrenceId: text("occurrence_id").references(() => occurrence.id),
    albumId: text("album_id").references(() => album.id),
    stickerId: text("sticker_id").references(() => sticker.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("ledger_user_created_idx").on(table.userId, table.createdAt)],
);

// ownership + duplicates. absence of a row = locked.
export const holding = sqliteTable(
  "holding",
  {
    id: text("id").primaryKey(),
    stickerId: text("sticker_id")
      .notNull()
      .references(() => sticker.id),
    quantity: integer("quantity").notNull().default(1),
    firstAcquiredAt: text("first_acquired_at").notNull(),
  },
  (table) => [
    check("holding_quantity_min_1", sql`${table.quantity} >= 1`),
    // UNIQUE, not a plain index. `ON CONFLICT(sticker_id)` needs a uniqueness
    // constraint to compile at all, and without it a second pull of the same
    // sticker writes a second row instead of incrementing quantity — the
    // duplicate count would then be silently wrong.
    uniqueIndex("holding_sticker_idx").on(table.stickerId),
  ],
);

// idempotency middleware storage (architecture.md §4.4).
export const mutation = sqliteTable("mutation", {
  key: text("key").primaryKey(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

// auth rate limiter: 10 attempts per 15-minute window per hashed IP (architecture.md §4.4).
export const authAttempt = sqliteTable(
  "auth_attempt",
  {
    ipHash: text("ip_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ipHash, table.windowStart] })],
);
