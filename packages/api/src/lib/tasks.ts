import {
  type CreateTask,
  DEFAULT_EFFORT_MINUTES,
  type RoutineSlot,
  type Task,
} from "@sticker-collector/shared";
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { epic, occurrence, routineSlot, task } from "../db/schema";
import { selectIn } from "./selectIn";

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
  "pinnedOn",
  // Unlike a pin, this is allowed on every kind of task: starting something
  // says nothing about which day it may be completed on, so none of the
  // scheduling rules apply to it.
  "startedAt",
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
    // Only an undated one-off may carry a pin — see `buildTaskPatch`.
    pinnedOn: input.type === "oneoff" && !input.dueAt ? (input.pinnedOn ?? null) : null,
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

  /**
   * Only an UNDATED one-off can be pinned to a day.
   *
   * Not a policy choice — `validateDate` lets a fresh completion through only
   * on a day the schedule yields, and the undated one-off is its single
   * exception ("completed on the day you tick it"). Pinning anything else would
   * put a row in today's list that this same API then refuses to complete, so
   * the refusal belongs here, where the cause is still legible.
   */
  if (data.pinnedOn != null) {
    const dated = "dueAt" in data ? data.dueAt != null : current.dueAt != null;
    if (current.type !== "oneoff" || dated) {
      return { error: "only an undated one-off can be pinned to a day" };
    }
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
export function toTask(
  row: TaskRow,
  lastCompletedOn: string | null = null,
  slots: RoutineSlot[] = [],
): Task {
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
    pinnedOn: row.pinnedOn,
    startedAt: row.startedAt,
    // Ordered by weekday, so the agenda and the form both read Monday-first
    // without either of them sorting.
    slots: [...slots].sort((a, b) => a.weekday - b.weekday),
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

  // A second query rather than a join: joining slots onto the completion
  // aggregate above would multiply the rows the MAX() runs over, and a routine
  // with five slots would need the GROUP BY rewritten to survive it.
  const bySlotTask = await slotsFor(
    database,
    rows.map((r) => r.row.id),
  );

  return rows.map((r) => toTask(r.row, r.lastCompletedOn, bySlotTask.get(r.row.id) ?? []));
}

/** Every routine's slots, keyed by task. Chunked: `IN (?, …)` counts against
 *  D1's 100-parameter ceiling as much as any write does (TD-35). */
export async function slotsFor(
  database: Db,
  taskIds: readonly string[],
): Promise<Map<string, RoutineSlot[]>> {
  const rows = await selectIn(taskIds, (batch) =>
    database
      .select({
        taskId: routineSlot.taskId,
        weekday: routineSlot.weekday,
        startMin: routineSlot.startMin,
        endMin: routineSlot.endMin,
      })
      .from(routineSlot)
      .where(inArray(routineSlot.taskId, batch)),
  );

  const map = new Map<string, RoutineSlot[]>();
  for (const row of rows) {
    const list = map.get(row.taskId) ?? [];
    list.push({ weekday: row.weekday, startMin: row.startMin, endMin: row.endMin });
    map.set(row.taskId, list);
  }
  return map;
}

/**
 * Every other live routine that has times, with them — the set a proposed slot
 * has to fit between.
 *
 * A join rather than `slotsFor`, and deliberately not driven by a list of ids:
 * the caller wants "everything else", and turning that into `IN (?, …)` would
 * put an unbounded id list back under D1's 100-parameter ceiling (TD-35) for no
 * gain. Only routines with slots can clash, and the join drops the rest.
 */
export async function otherRoutineSlots(
  database: Db,
  userId: string,
  exceptTaskId?: string,
): Promise<{ id: string; title: string; slots: RoutineSlot[] }[]> {
  const rows = await database
    .select({
      id: task.id,
      title: task.title,
      weekday: routineSlot.weekday,
      startMin: routineSlot.startMin,
      endMin: routineSlot.endMin,
    })
    .from(routineSlot)
    .innerJoin(task, eq(task.id, routineSlot.taskId))
    .where(and(liveTasks(userId), eq(task.type, "routine")));

  const byTask = new Map<string, { id: string; title: string; slots: RoutineSlot[] }>();
  for (const row of rows) {
    if (row.id === exceptTaskId) continue;
    const entry = byTask.get(row.id) ?? { id: row.id, title: row.title, slots: [] };
    entry.slots.push({ weekday: row.weekday, startMin: row.startMin, endMin: row.endMin });
    byTask.set(row.id, entry);
  }
  return [...byTask.values()];
}

/** The rows for one task's slots, ready to insert. */
export function slotRows(taskId: string, slots: readonly RoutineSlot[]) {
  return slots.map((slot) => ({
    id: crypto.randomUUID(),
    taskId,
    weekday: slot.weekday,
    startMin: slot.startMin,
    endMin: slot.endMin,
  }));
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
