import {
  type CompleteOccurrence,
  canComplete,
  completeOccurrenceSchema,
  deriveStatus,
  type LocalDate,
  occurrencesInWindow,
  scheduleOf,
  todayIn,
} from "@sticker-collector/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { occurrence, task } from "../db/schema";

import type { TaskRow } from "./tasks";
import { timeZoneOf } from "./user";

export type OccurrenceRowFull = typeof occurrence.$inferSelect;

export interface Loaded {
  task: TaskRow;
  /** The stored row, if a human has already touched this day. */
  existing: OccurrenceRowFull | null;
}

export type LoadResult = Loaded | { error: string; status: 400 | 404 };

export const isError = (r: LoadResult): r is { error: string; status: 400 | 404 } => "error" in r;

/**
 * Resolves an occurrence reference to the task and whatever row exists,
 * refusing anything that must not be completable.
 *
 * The guard that matters most is the scheduling check. Without it a client can
 * POST any date at all and mint coins for a day the routine was never scheduled
 * on — the reference is (taskId, scheduledOn) precisely because the row does
 * not exist yet, so nothing else validates the date.
 */
export async function loadOccurrence(
  database: Db,
  userId: string,
  ref: { taskId: string; scheduledOn: LocalDate },
  timeZone: string,
): Promise<LoadResult> {
  const rows = await database
    .select()
    .from(task)
    .where(and(eq(task.id, ref.taskId), eq(task.userId, userId), isNull(task.deletedAt)))
    .limit(1);
  const found = rows[0];
  if (!found) return { error: "not found", status: 404 };

  const stored = await database
    .select()
    .from(occurrence)
    .where(and(eq(occurrence.taskId, ref.taskId), eq(occurrence.scheduledOn, ref.scheduledOn)))
    .limit(1);
  const existing = stored[0] ?? null;

  // A row that already exists is legitimate by construction — a human put it
  // there. Re-validating would strand it if the routine's mask changed since,
  // making a completed day impossible to re-open.
  if (!existing) {
    const refused = validateDate(found, ref.scheduledOn, timeZone);
    if (refused) return refused;
  }

  return { task: found, existing };
}

/**
 * Is this a date the task can be closed on?
 *
 * Without this a client could POST any date at all and mint coins for a day the
 * routine was never scheduled on — the reference is (taskId, scheduledOn)
 * precisely because the row does not exist yet.
 *
 * The undated one-off is the exception. Quick-add creates them ("capture must
 * never cost a form") and they live in the Backlog with no scheduled day at
 * all, so `occurrencesInWindow` yields nothing for them — correctly. They are
 * completed on the day you tick them, so today is the only date that means
 * anything.
 */
function validateDate(
  found: TaskRow,
  scheduledOn: LocalDate,
  timeZone: string,
): { error: string; status: 400 } | null {
  const schedule = scheduleOf(found, timeZone);

  if (schedule.kind === "oneoff" && !schedule.dueOn) {
    return scheduledOn === todayIn(timeZone)
      ? null
      : { error: "an undated task can only be completed today", status: 400 };
  }

  return occurrencesInWindow(schedule, scheduledOn, scheduledOn).length > 0
    ? null
    : { error: "the task is not scheduled on that date", status: 400 };
}

/** Whether this day may be ticked: not in the future, not archived, not done. */
export function completionGuard(
  loaded: Loaded,
  today: LocalDate,
  scheduledOn: LocalDate,
): { error: string; status: 400 | 409 } | null {
  const storedStatus = loaded.existing?.status ?? null;
  if (storedStatus === "done") return { error: "already completed", status: 409 };

  if (!canComplete({ kind: loaded.task.type, scheduledOn, storedStatus }, today)) {
    const status = deriveStatus({ kind: loaded.task.type, scheduledOn, storedStatus }, today);
    return status === "archived"
      ? { error: "archived occurrences are no longer completable", status: 400 }
      : { error: "an occurrence cannot be completed before its scheduled date", status: 400 };
  }
  return null;
}

/**
 * The coins this completion pays.
 *
 * A first completion snapshots the task's reward as it stands now. A later
 * re-completion pays the SAME frozen number — the `occurrence_snapshot_write_once`
 * trigger makes that the only possibility, and it is the right rule: the coins
 * for a given scheduled day are fixed the first time it is closed.
 */
export function rewardFor(loaded: Loaded): number {
  return loaded.existing?.rewardSnapshotCoins ?? loaded.task.rewardCoins;
}

export type Resolved =
  | { ok: true; ref: CompleteOccurrence; today: LocalDate; loaded: Loaded }
  | { ok: false; error: string; status: 400 | 404; issues?: unknown };

/**
 * The preamble both mutations share: validate the reference, find the user's
 * timezone, resolve "today" from it, and load the task and any stored row.
 *
 * One place, so complete and uncomplete cannot drift on which guards run.
 */
export async function resolveOccurrence(
  database: Db,
  userId: string,
  body: unknown,
): Promise<Resolved> {
  const parsed = completeOccurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "bad request", status: 400, issues: parsed.error.issues };
  }

  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return { ok: false, error: "not found", status: 404 };

  const loaded = await loadOccurrence(database, userId, parsed.data, timeZone);
  if (isError(loaded)) return { ok: false, error: loaded.error, status: loaded.status };

  return { ok: true, ref: parsed.data, today: todayIn(timeZone), loaded };
}
