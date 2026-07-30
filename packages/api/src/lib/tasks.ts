import { type CreateTask, DEFAULT_EFFORT_MINUTES, type Task } from "@sticker-collector/shared";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { epic, occurrence, task } from "../db/schema";

export type TaskRow = typeof task.$inferSelect;
export type TaskInsert = typeof task.$inferInsert;

/** Fields a PATCH may touch. `type` is fixed at creation, `userId` is never
 *  client-supplied, and `createdAt`/`deletedAt` are the server's to set. */
export const PATCHABLE = [
  "title",
  "description",
  "url",
  "epicId",
  "effortMinutes",
  "rewardCoins",
  "priority",
  "weekdays",
  "startsOn",
  "endsOn",
  "dueAt",
] as const;

export type PatchField = (typeof PATCHABLE)[number];

/** A validated create payload as a row. The schema has already enforced the
 *  discriminant; this keeps the columns the other type must not use empty. */
export function newTaskRow(userId: string, input: CreateTask): TaskInsert {
  return {
    id: crypto.randomUUID(),
    userId,
    epicId: input.epicId ?? null,
    title: input.title,
    description: input.description ?? null,
    url: input.url ?? null,
    effortMinutes: input.effortMinutes,
    rewardCoins: input.rewardCoins,
    priority: input.priority,
    type: input.type,
    weekdays: input.type === "routine" ? input.weekdays : null,
    startsOn: input.type === "routine" ? (input.startsOn ?? null) : null,
    endsOn: input.type === "routine" ? (input.endsOn ?? null) : null,
    dueAt: input.type === "oneoff" ? (input.dueAt ?? null) : null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
}

/** Quick-add: an undated one-off at the default effort, reward matching. */
export function quickAddRow(userId: string, title: string): TaskInsert {
  return {
    id: crypto.randomUUID(),
    userId,
    epicId: null,
    title,
    description: null,
    url: null,
    effortMinutes: DEFAULT_EFFORT_MINUTES,
    rewardCoins: DEFAULT_EFFORT_MINUTES,
    priority: "medium",
    type: "oneoff",
    weekdays: null,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
}

/**
 * Turns a validated patch into the columns to write, refusing the two things
 * `updateTaskSchema` cannot see:
 *
 * - scheduling fields that belong to the other task type (the schema does not
 *   know whether this row is a routine or a one-off);
 * - a date bound that is only invalid once MERGED with the stored row — moving
 *   `endsOn` before an untouched `startsOn` looks fine in isolation.
 */
export function buildTaskPatch(
  current: TaskRow,
  data: Partial<Record<PatchField, unknown>>,
): { patch: Record<string, unknown> } | { error: string } {
  if (current.type === "routine" && data.dueAt != null) {
    return { error: "a routine has no due date" };
  }
  if (current.type === "oneoff" && ("weekdays" in data || "startsOn" in data || "endsOn" in data)) {
    return { error: "a one-off has no weekday schedule" };
  }

  const patch: Record<string, unknown> = {};
  for (const field of PATCHABLE) {
    if (field in data && data[field] !== undefined) patch[field] = data[field];
  }

  const merged = { ...current, ...patch } as TaskRow;
  if (merged.startsOn && merged.endsOn && merged.startsOn > merged.endsOn) {
    return { error: "endsOn must not be before startsOn" };
  }

  return { patch };
}

/**
 * INSERT/UPDATE ... RETURNING always yields the row when it changed anything,
 * but the type is `T[]`. This narrows it and fails loudly rather than silently
 * serialising `undefined` if that assumption ever stops holding.
 */
export function requireRow<T>(rows: T[], what = "row"): T {
  const row = rows[0];
  if (!row) throw new Error(`expected a ${what}`);
  return row;
}

/** The row as the API returns it. `userId` never leaves the server. */
export function toTask(row: TaskRow, lastCompletedOn: string | null = null): Task {
  return {
    id: row.id,
    epicId: row.epicId,
    title: row.title,
    description: row.description,
    url: row.url,
    effortMinutes: row.effortMinutes,
    rewardCoins: row.rewardCoins,
    priority: row.priority,
    type: row.type,
    weekdays: row.weekdays,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    dueAt: row.dueAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    lastCompletedOn,
  };
}

/**
 * Task rows with the latest day each was closed.
 *
 * `MAX(scheduled_on)` over done occurrences, so the Backlog can tell a finished
 * undated one-off from an open one without depending on how wide a window the
 * client happened to ask for.
 */
export async function selectTasksWithCompletion(
  database: Db,
  filters: SQL | undefined,
): Promise<Task[]> {
  const rows = await database
    .select({
      row: task,
      lastCompletedOn: sql<
        string | null
      >`MAX(CASE WHEN ${occurrence.status} = 'done' THEN ${occurrence.scheduledOn} END)`,
    })
    .from(task)
    .leftJoin(occurrence, eq(occurrence.taskId, task.id))
    .where(filters)
    .groupBy(task.id);
  return rows.map((r) => toTask(r.row, r.lastCompletedOn));
}

/**
 * A user's live tasks — the ones scoped to them and not soft-deleted.
 *
 * This predicate is what makes DELETE stop generation: T-04 walks this set to
 * materialise a window, so a task with `deleted_at` set simply stops producing
 * occurrences. Its past occurrences and the coins they paid are untouched,
 * because they live in their own rows and the ledger is append-only.
 */
export function liveTasks(userId: string) {
  return and(eq(task.userId, userId), isNull(task.deletedAt));
}

/** The set a generator may produce occurrences for. One source, so T-04 and
 *  the task list cannot disagree about what "deleted" means. */
export async function listGeneratingTasks(database: Db, userId: string): Promise<TaskRow[]> {
  return database.select().from(task).where(liveTasks(userId));
}

/** True when the epic exists and belongs to this user — so a bad `epicId`
 *  returns 400 rather than a foreign-key 500. */
export async function ownsEpic(database: Db, userId: string, epicId: string): Promise<boolean> {
  const rows = await database
    .select({ id: epic.id })
    .from(epic)
    .where(and(eq(epic.id, epicId), eq(epic.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
