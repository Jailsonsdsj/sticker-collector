import { z } from "zod";
import { TIERS, validateOdds } from "./economy.js";
import { isImageKey } from "./image.js";
import { WEEKDAYS_MASK_ALL } from "./recurrence.js";

/**
 * Every task, epic and occurrence payload. One schema, two consumers — the
 * Worker validates requests with it, the browser types its fetches from it.
 *
 * The cross-field rules live here and nowhere else. The database has
 * `weekdays`, `starts_on`, `ends_on` and `due_at` all nullable and enforces no
 * relationship between them, because a routine and a one-off share one table.
 * This file is the only thing that knows a routine must have a mask and must
 * not have a due date.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

/** A civil date, "YYYY-MM-DD". `z.iso.date()` rejects 2025-02-30 for us. */
export const localDateSchema = z.iso.date();

/** A UTC instant, ISO-8601. Times are UTC; the local day comes from the tz. */
export const instantSchema = z.iso.datetime();

export const prioritySchema = z.enum(["low", "medium", "high"]);
export type Priority = z.infer<typeof prioritySchema>;

export const taskTypeSchema = z.enum(["routine", "oneoff"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const occurrenceStatusSchema = z.enum(["pending", "done", "missed", "archived"]);
export type OccurrenceStatusValue = z.infer<typeof occurrenceStatusSchema>;

/**
 * An epic's accent is a design token name, never a colour. Storing `#c65cff`
 * would put a literal colour in the database and defeat the token guard the
 * moment a component rendered it. These map to `--color-epic-*` in tokens.css.
 */
/**
 * The palette an epic picks from.
 *
 * Every value here must have a `--color-epic-N` in `tokens.css`, or an epic
 * validates fine and then renders with no colour at all.
 */
export const EPIC_ACCENTS = [
  "epic-1",
  "epic-2",
  "epic-3",
  "epic-4",
  "epic-5",
  "epic-6",
  "epic-7",
  "epic-8",
  "epic-9",
  "epic-10",
  "epic-11",
  "epic-12",
  "epic-13",
  "epic-14",
  "epic-15",
] as const;

export const epicAccentSchema = z.enum(EPIC_ACCENTS);
export type EpicAccent = z.infer<typeof epicAccentSchema>;

/**
 * Which of the three lists an epic sits in.
 *
 * Stored, not derived: "next" is a decision about what to pick up, and
 * "achieved" is a decision that something is finished — neither follows from
 * the one-off ratio. An epic at 100% may still be running, and an epic at 40%
 * may be as done as it is ever going to be.
 *
 * `active` is the default so every epic that already exists stays exactly where
 * it was.
 */
export const EPIC_STATUSES = ["active", "next", "achieved"] as const;
export const epicStatusSchema = z.enum(EPIC_STATUSES);
export type EpicStatus = z.infer<typeof epicStatusSchema>;

/** 7-bit weekday mask, bit 0 = Monday. A routine with no days is not a routine. */
export const weekdayMaskSchema = z.int().min(1).max(WEEKDAYS_MASK_ALL);

/** Effort is minutes; reward is coins. Both integers — no floats in the economy. */
export const effortMinutesSchema = z
  .int()
  .positive()
  .max(24 * 60);
export const rewardCoinsSchema = z.int().min(0);

/** Quick-add captures a one-off with no form, so it needs a default effort. */
export const DEFAULT_EFFORT_MINUTES = 30;

const titleSchema = z.string().trim().min(1).max(200);
const idSchema = z.string().min(1);

// ── Task ─────────────────────────────────────────────────────────────────────

const taskCommonFields = {
  title: titleSchema,
  description: z.string().max(2000).nullish(),
  url: z.url().nullish(),
  epicId: idSchema.nullish(),
  effortMinutes: effortMinutesSchema,
  /** Omit to inherit the effort, per prd/02-tasks.md. */
  rewardCoins: rewardCoinsSchema.optional(),
  priority: prioritySchema.default("medium"),
};

const createRoutineSchema = z
  .strictObject({
    ...taskCommonFields,
    type: z.literal("routine"),
    weekdays: weekdayMaskSchema,
    startsOn: localDateSchema.nullish(),
    endsOn: localDateSchema.nullish(),
  })
  .refine((t) => !(t.startsOn && t.endsOn) || t.startsOn <= t.endsOn, {
    message: "endsOn must not be before startsOn",
    path: ["endsOn"],
  });

const createOneOffSchema = z.strictObject({
  ...taskCommonFields,
  type: z.literal("oneoff"),
  /** Null or absent means undated: General only, and it never archives. */
  dueAt: instantSchema.nullish(),
  /** Capture it and do it today, without a second round trip. */
  pinnedOn: localDateSchema.nullish(),
});

/**
 * A routine must carry a mask and must not carry a due date; a one-off is the
 * reverse. Modelled as a discriminated union so the error names the right field
 * instead of "invalid task".
 *
 * The transform is the reward default: input may omit `rewardCoins`, output
 * always has one. Lexical dates make `startsOn <= endsOn` a string compare.
 */
export const createTaskSchema = z
  .discriminatedUnion("type", [createRoutineSchema, createOneOffSchema])
  .transform((task) => ({
    ...task,
    rewardCoins: task.rewardCoins ?? task.effortMinutes,
  }));
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTask = z.output<typeof createTaskSchema>;

/**
 * Edits are partial, but the type is fixed at creation (prd/02-tasks.md
 * §Scheduling: "the choice is made at creation"), so `type` is not editable.
 */
export const updateTaskSchema = z
  .strictObject({
    title: titleSchema,
    description: z.string().max(2000).nullish(),
    url: z.url().nullish(),
    epicId: idSchema.nullish(),
    effortMinutes: effortMinutesSchema,
    rewardCoins: rewardCoinsSchema,
    priority: prioritySchema,
    weekdays: weekdayMaskSchema,
    startsOn: localDateSchema.nullish(),
    endsOn: localDateSchema.nullish(),
    dueAt: instantSchema.nullish(),
    /** Set to today to pin, null to unpin. */
    pinnedOn: localDateSchema.nullish(),
  })
  .partial()
  .refine((t) => Object.keys(t).length > 0, { message: "no fields to update" })
  .refine((t) => !(t.startsOn && t.endsOn) || t.startsOn <= t.endsOn, {
    message: "endsOn must not be before startsOn",
    path: ["endsOn"],
  });
export type UpdateTask = z.infer<typeof updateTaskSchema>;

/** One field, no form. Creates an undated one-off at the default effort. */
export const quickAddTaskSchema = z.strictObject({ title: titleSchema });
export type QuickAddTask = z.infer<typeof quickAddTaskSchema>;

/** Multi-select duplicate and delete. */
export const bulkTaskIdsSchema = z.strictObject({ ids: z.array(idSchema).min(1).max(200) });
export type BulkTaskIds = z.infer<typeof bulkTaskIdsSchema>;

/** The read model. `deletedAt` is soft delete: a deleted routine stops
 *  generating, but its past occurrences and their coins survive. */
export const taskSchema = z.object({
  id: idSchema,
  epicId: idSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  effortMinutes: effortMinutesSchema,
  rewardCoins: rewardCoinsSchema,
  priority: prioritySchema,
  type: taskTypeSchema,
  weekdays: z.int().nullable(),
  startsOn: localDateSchema.nullable(),
  endsOn: localDateSchema.nullable(),
  dueAt: instantSchema.nullable(),
  /**
   * The local day this task is pinned to, or null.
   *
   * A date, not a boolean, so the pin expires on its own — "do this today" is a
   * claim about today, and a boolean would still be true next week with no way
   * to tell a deliberate pin from a forgotten one.
   */
  pinnedOn: localDateSchema.nullable(),
  createdAt: instantSchema,
  deletedAt: instantSchema.nullable(),
  /**
   * The latest day this task was closed, or null if never.
   *
   * The Backlog shows undated one-offs, and the only evidence one is finished
   * is a done occurrence — which the client sees through a bounded window. Without
   * this field a task completed outside that window silently reappears forever.
   */
  lastCompletedOn: localDateSchema.nullable(),
});
export type Task = z.infer<typeof taskSchema>;

// ── Occurrence ───────────────────────────────────────────────────────────────

/**
 * An occurrence is addressed by (taskId, scheduledOn), never by id.
 *
 * This follows directly from lazy materialisation: the row usually does not
 * exist when the client wants to tick it, so there is no id to send. The
 * `occurrence_task_scheduled_unique` index is the real key.
 */
export const occurrenceRefSchema = z.strictObject({
  taskId: idSchema,
  scheduledOn: localDateSchema,
});
export type OccurrenceRef = z.infer<typeof occurrenceRefSchema>;

export const completeOccurrenceSchema = occurrenceRefSchema;
export type CompleteOccurrence = z.infer<typeof completeOccurrenceSchema>;

/** GET /api/occurrences?from&to — a window, never the whole future. */
export const occurrenceWindowQuerySchema = z
  .strictObject({ from: localDateSchema, to: localDateSchema })
  .refine((q) => q.from <= q.to, { message: "to must not be before from", path: ["to"] });
export type OccurrenceWindowQuery = z.infer<typeof occurrenceWindowQuerySchema>;

/**
 * The read model. `status` is derived at read time (architecture.md §0.3) and
 * `rewardSnapshotCoins` is frozen at completion — it is the coins this
 * occurrence actually paid, not what the task is worth today.
 */
export const occurrenceSchema = z.object({
  taskId: idSchema,
  scheduledOn: localDateSchema,
  status: occurrenceStatusSchema,
  completedAt: instantSchema.nullable(),
  rewardSnapshotCoins: rewardCoinsSchema.nullable(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

// ── Epic ─────────────────────────────────────────────────────────────────────

export const createEpicSchema = z.strictObject({
  title: titleSchema,
  /** Optional, author-written. Empty means "none", not an empty description. */
  description: z.string().max(2000).nullish(),
  accent: epicAccentSchema.default("epic-1"),
  status: epicStatusSchema.default("active"),
  /** "Finish this epic to afford the Travel album" — informational only. */
  coinGoalAlbumId: idSchema.nullish(),
});
export type CreateEpicInput = z.input<typeof createEpicSchema>;
export type CreateEpic = z.output<typeof createEpicSchema>;

export const updateEpicSchema = z
  .strictObject({
    title: titleSchema,
    description: z.string().max(2000).nullish(),
    accent: epicAccentSchema,
    status: epicStatusSchema,
    coinGoalAlbumId: idSchema.nullish(),
  })
  .partial()
  .refine((e) => Object.keys(e).length > 0, { message: "no fields to update" });
export type UpdateEpic = z.infer<typeof updateEpicSchema>;

/** Deleting an epic asks what happens to its tasks. There is no default —
 *  the user must choose, because one option destroys work. */
export const deleteEpicSchema = z.strictObject({ mode: z.enum(["cascade", "unlink"]) });
export type DeleteEpic = z.infer<typeof deleteEpicSchema>;

/** The read model. The progress ratio counts one-offs only — routines never
 *  "finish", so including them would peg every epic below 100% forever. */
export const epicSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  accent: epicAccentSchema,
  status: epicStatusSchema,
  coinGoalAlbumId: idSchema.nullable(),
  createdAt: instantSchema,
  oneOffTotal: z.int().min(0),
  oneOffDone: z.int().min(0),
});
export type Epic = z.infer<typeof epicSchema>;

/**
 * The signed-in user's own settings.
 *
 * `timezone` is the one that matters everywhere: the local day is resolved from
 * it on the server, so the client has to resolve it the same way or the two
 * disagree about what "today" is — which is a 400 on every completion for the
 * hours they disagree for.
 */
export const meSchema = z.object({
  userId: idSchema,
  timezone: z.string().min(1),
});
export type Me = z.infer<typeof meSchema>;

/** IANA name, validated by asking the runtime rather than by pattern. */
export const updateMeSchema = z.strictObject({
  timezone: z.string().min(1).max(64),
});
export type UpdateMe = z.infer<typeof updateMeSchema>;

/** Does this runtime know the zone? A typo here silently moves every day
 *  boundary, so it is worth refusing at the door. */
export function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// ── Album ────────────────────────────────────────────────────────────────────

export const tierSchema = z.enum(TIERS);

/** Prices are integer coins, and a tier may legitimately be free. */
const tierPriceSchema = z.int().min(0).max(1_000_000);
const oddsValueSchema = z.int().min(0).max(100);

const perTier = <T extends z.ZodTypeAny>(value: T) =>
  z.strictObject({
    common: value,
    rare: value,
    epic: value,
    legendary: value,
  });

export const tierPricesSchema = perTier(tierPriceSchema);
export const tierOddsSchema = perTier(oddsValueSchema);

/** A stored image, addressed by the hash of its own bytes (`img/<sha256>.jpg`). */
export const imageKeySchema = z.string().refine(isImageKey, "not an image key");

/** An album's grid is capped so one seal stays inside a single D1 batch. */
export const ALBUM_MAX_STICKERS = 200;

export const createStickerSchema = z.strictObject({
  imageKey: imageKeySchema,
  tier: tierSchema,
  /** Optional, author-written. Frozen with the row at seal, like the tier. */
  title: z.string().max(120).nullish(),
  description: z.string().max(2000).nullish(),
});
export type CreateSticker = z.infer<typeof createStickerSchema>;

/**
 * Creating an album is also sealing it (§Sealing 11), so every economic number
 * and the whole sticker set arrive in one request. There is no draft on the
 * server: `sticker_frozen` blocks all updates to sticker rows, so a two-step
 * flow could never add the second half of the set.
 */
export const createAlbumSchema = z
  .strictObject({
    title: titleSchema,
    description: z.string().max(2000).nullish(),
    coverKey: imageKeySchema,
    unlockPrice: tierPriceSchema,
    /**
     * At least 1. At zero, `duplicateRefund` returns nothing and A-01's
     * guarantee that a duplicate is always a net loss becomes vacuous — the
     * pull would be free, so there would be nothing to lose.
     */
    randomPrice: z.int().min(1).max(1_000_000),
    prices: tierPricesSchema,
    odds: tierOddsSchema,
    stickers: z.array(createStickerSchema).min(1).max(ALBUM_MAX_STICKERS),
    /** Set when this album is a new edition of an existing one (§Creating from existing). */
    derivedFromAlbumId: idSchema.nullish(),
    /** Hide slots that have not been collected yet. */
    hideLocked: z.boolean().default(false),
    /** One stand-in image for every locked slot. Only meaningful with `hideLocked`. */
    lockedCoverKey: imageKeySchema.nullish(),
  })
  .superRefine((value, ctx) => {
    // One rule, three consumers: the wizard, this route, and the DB CHECK that
    // enforces the sum. Monotonicity and the integer range live only here.
    const problem = validateOdds(value.odds);
    if (problem) {
      ctx.addIssue({ code: "custom", path: ["odds"], message: problem });
    }

    // A cover for locked slots means nothing when nothing is hidden. Refusing
    // it here keeps the two fields from disagreeing in the database, where the
    // album is immutable and the disagreement would be permanent.
    if (value.lockedCoverKey && !value.hideLocked) {
      ctx.addIssue({
        code: "custom",
        path: ["lockedCoverKey"],
        message: "a locked cover needs hideLocked",
      });
    }
  });
export type CreateAlbumInput = z.input<typeof createAlbumSchema>;
export type CreateAlbum = z.output<typeof createAlbumSchema>;

export const stickerSchema = z.object({
  id: idSchema,
  albumId: idSchema,
  imageKey: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  tier: tierSchema,
  slotIndex: z.int().min(0),
});
export type Sticker = z.infer<typeof stickerSchema>;

export const albumSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  coverKey: z.string(),
  derivedFromAlbumId: idSchema.nullable(),
  unlockPrice: z.int().min(0),
  randomPrice: z.int().min(0),
  prices: tierPricesSchema,
  odds: tierOddsSchema,
  /** Slots not yet collected show a stand-in rather than grayscale art. */
  hideLocked: z.boolean(),
  lockedCoverKey: z.string().nullable(),
  /** Null until bought. A new album always arrives locked (§Creating from existing 4). */
  unlockedAt: instantSchema.nullable(),
  /** Set exactly once, on first hit of 100% (A-05). */
  completedAt: instantSchema.nullable(),
  sealedAt: instantSchema,
  createdAt: instantSchema,
  editionNumber: z.int().min(1),
});
export type Album = z.infer<typeof albumSchema>;

export const sealedAlbumSchema = z.object({
  album: albumSchema,
  stickers: z.array(stickerSchema),
});
export type SealedAlbum = z.infer<typeof sealedAlbumSchema>;

/** What a purchase returns: the new balance, and what it bought. */
export const purchaseResultSchema = z.object({
  balance: z.int(),
  spentCoins: z.int().min(0),
  albumId: idSchema,
  stickerId: idSchema.nullable(),
  /** Copies held after the purchase; null when nothing was acquired. */
  quantity: z.int().min(1).nullable(),
});
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

/** What a random pull returned, and what it cost. */
export const pullResultSchema = z.object({
  balance: z.int(),
  spentCoins: z.int().min(0),
  albumId: idSchema,
  stickerId: idSchema,
  tier: tierSchema,
  /** Copies held after the pull. Greater than 1 means the roll returned a dupe. */
  quantity: z.int().min(1),
  duplicate: z.boolean(),
  /** What this copy would sell for, so a duplicate ends in a choice, not a dead end. */
  refundIfSold: z.int().min(0),
});
export type PullResult = z.infer<typeof pullResultSchema>;

export const saleResultSchema = z.object({
  balance: z.int(),
  refundedCoins: z.int().min(0),
  stickerId: idSchema,
  /** Copies still held after the sale. Never below 1 — the last copy is not for sale. */
  quantity: z.int().min(1),
});
export type SaleResult = z.infer<typeof saleResultSchema>;

export const albumStatusSchema = z.enum(["locked", "in_progress", "completed"]);

/**
 * An album in the listing. `owned`, `total`, `percent` and `status` are all
 * computed from the holdings on every read — none of them is a column.
 */
export const albumSummarySchema = albumSchema.extend({
  owned: z.int().min(0),
  total: z.int().min(0),
  percent: z.int().min(0).max(100),
  status: albumStatusSchema,
  remaining: z.int().min(0),
  /** Within one or two slots of done — the nudge worth surfacing (§Enhancements). */
  almostThere: z.boolean(),
  /** Locked, and the current balance covers the unlock price. */
  affordable: z.boolean(),
});
export type AlbumSummary = z.infer<typeof albumSummarySchema>;

/** A sticker plus how many copies are held. Zero means the slot is still empty. */
export const ownedStickerSchema = stickerSchema.extend({ quantity: z.int().min(0) });
export type OwnedSticker = z.infer<typeof ownedStickerSchema>;

/**
 * One album with its whole grid. Unowned slots are **present with quantity 0**,
 * never omitted — the grid has to render a locked slot's rarity frame before
 * the sticker is owned (`prd/05-stickers.md` §Rarity 3).
 */
export const albumDetailSchema = z.object({
  album: albumSummarySchema,
  stickers: z.array(ownedStickerSchema),
});
export type AlbumDetail = z.infer<typeof albumDetailSchema>;

export const ALBUM_SORTS = ["status", "title", "progress", "created"] as const;

export const albumQuerySchema = z.strictObject({
  status: albumStatusSchema.optional(),
  sort: z.enum(ALBUM_SORTS).default("status"),
});
export type AlbumQuery = z.infer<typeof albumQuerySchema>;

// ── Backup ───────────────────────────────────────────────────────────────────

export const BACKUP_VERSION = 1;

/**
 * Everything the app knows, in one object.
 *
 * Three things are deliberately **absent**, and their absence is the design:
 *
 * - `auth_key_hash`, `kdf_salt`, `kdf_iterations`. A file carrying those is a
 *   credential file, and the spec's own recovery story is that *a lost
 *   passphrase is recovered by restoring the export* — restoring the old hash
 *   would defeat the one thing the backup exists for.
 * - `mutation`. Idempotency keys are about requests in flight; replaying old
 *   ones after a restore makes the next retry of any mutation return a stale
 *   response from a previous life.
 * - `auth_attempt`. Rate-limit state, meaningless once restored elsewhere.
 *
 * Rows keep their own ids so references between them survive; `user_id` is
 * rewritten on restore, which is what makes a backup portable between
 * deployments.
 */
export const backupManifestSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: instantSchema,
  user: z.object({ timezone: z.string() }),
  epics: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
  occurrences: z.array(z.record(z.string(), z.unknown())),
  ledger: z.array(z.record(z.string(), z.unknown())),
  albums: z.array(z.record(z.string(), z.unknown())),
  stickers: z.array(z.record(z.string(), z.unknown())),
  holdings: z.array(z.record(z.string(), z.unknown())),
  /** Every image the data references — the irreplaceable half of a backup. */
  imageKeys: z.array(z.string()),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;

export const restoreResultSchema = z.object({
  restored: z.object({
    epics: z.int(),
    tasks: z.int(),
    occurrences: z.int(),
    ledger: z.int(),
    albums: z.int(),
    stickers: z.int(),
    holdings: z.int(),
  }),
});
export type RestoreResult = z.infer<typeof restoreResultSchema>;

// ── Wallet ───────────────────────────────────────────────────────────────────

export const ledgerReasonSchema = z.enum([
  "task_reward",
  "album_unlock",
  "sticker_buy",
  "random_pull",
  "duplicate_sale",
]);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;

/**
 * One ledger row. `amountCoins` is signed — a reversal is a negative entry, not
 * a deletion, because the ledger is append-only by trigger (architecture.md §4.1).
 */
export const ledgerEntrySchema = z.object({
  id: idSchema,
  amountCoins: z.int(),
  reason: ledgerReasonSchema,
  occurrenceId: idSchema.nullable(),
  albumId: idSchema.nullable(),
  stickerId: idSchema.nullable(),
  createdAt: instantSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** The balance is `SUM(ledger)`. It is never a column, never cached. */
export const walletSchema = z.object({ balance: z.int() });
export type Wallet = z.infer<typeof walletSchema>;

export const LEDGER_PAGE_DEFAULT = 50;
export const LEDGER_PAGE_MAX = 100;

/**
 * Keyset pagination, not OFFSET. The ledger is append-only and read
 * newest-first, so an offset silently skips or repeats rows as entries arrive
 * between pages. The cursor is opaque on purpose.
 */
export const ledgerQuerySchema = z.strictObject({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(LEDGER_PAGE_MAX).default(LEDGER_PAGE_DEFAULT),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const ledgerPageSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  /** Null on the last page. */
  nextCursor: z.string().nullable(),
});
export type LedgerPage = z.infer<typeof ledgerPageSchema>;
