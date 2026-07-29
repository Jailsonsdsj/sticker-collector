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
export const epicAccentSchema = z.enum(["epic-1", "epic-2", "epic-3", "epic-4", "epic-5"]);
export type EpicAccent = z.infer<typeof epicAccentSchema>;

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
  /** Null or absent means undated: backlog only, and it never archives. */
  dueAt: instantSchema.nullish(),
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
  accent: epicAccentSchema.default("epic-1"),
  /** "Finish this epic to afford the Travel album" — informational only. */
  coinGoalAlbumId: idSchema.nullish(),
});
export type CreateEpicInput = z.input<typeof createEpicSchema>;
export type CreateEpic = z.output<typeof createEpicSchema>;

export const updateEpicSchema = z
  .strictObject({
    title: titleSchema,
    accent: epicAccentSchema,
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
  accent: epicAccentSchema,
  coinGoalAlbumId: idSchema.nullable(),
  createdAt: instantSchema,
  oneOffTotal: z.int().min(0),
  oneOffDone: z.int().min(0),
});
export type Epic = z.infer<typeof epicSchema>;

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
  })
  .superRefine((value, ctx) => {
    // One rule, three consumers: the wizard, this route, and the DB CHECK that
    // enforces the sum. Monotonicity and the integer range live only here.
    const problem = validateOdds(value.odds);
    if (problem) {
      ctx.addIssue({ code: "custom", path: ["odds"], message: problem });
    }
  });
export type CreateAlbumInput = z.input<typeof createAlbumSchema>;
export type CreateAlbum = z.output<typeof createAlbumSchema>;

export const stickerSchema = z.object({
  id: idSchema,
  albumId: idSchema,
  imageKey: z.string(),
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
