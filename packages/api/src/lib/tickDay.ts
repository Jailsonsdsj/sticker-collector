import { compareDates, deriveStatus, type LocalDate, todayIn } from "@sticker-collector/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { task } from "../db/schema";
import { isError, loadOccurrence } from "./complete";

/**
 * The day a step's tick is stamped with, or why it cannot be stamped at all.
 *
 * **Today, unless a routine names a past day it can still close.** A routine's
 * steps are judged against the day being completed (`stepsGuard`), so a missed
 * Tuesday with "block Done until the steps are finished" needs steps done *on
 * Tuesday* — and when this could only ever stamp today, no such step could
 * exist once Tuesday was over. The occurrence stayed completable for a week and
 * paid in full, and nothing could ever unblock it.
 *
 * What a client-chosen date must not do is tick a day that could not be closed
 * anyway, so the date goes through **the same checks completion uses**: on the
 * routine's schedule (`loadOccurrence`), not in the future, not archived. One
 * definition of which days are open, rather than a second, looser one here.
 *
 * Today skips all of that, exactly as before: a step can be ticked on a routine
 * that does not run today — the Epics tab does it — and that is not a day
 * anybody is closing.
 *
 * A one-off ignores the date. Its steps count as done on any day, so there is
 * no day to choose and nothing a date could get wrong.
 */
export async function tickDay(
  database: Db,
  userId: string,
  taskId: string,
  requested: LocalDate | undefined,
  timeZone: string,
): Promise<{ on: LocalDate } | { error: string; status: 400 | 404 }> {
  const today = todayIn(timeZone);

  // Joined on the owner so a step can only be ticked by whoever owns the task
  // it belongs to — `subtask` carries no user id of its own.
  const rows = await database
    .select({ type: task.type })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.userId, userId), isNull(task.deletedAt)))
    .limit(1);
  const found = rows[0];
  if (!found) return { error: "not found", status: 404 };

  if (found.type === "oneoff" || !requested || requested === today) return { on: today };

  if (compareDates(requested, today) > 0) {
    return { error: "a step cannot be ticked for a day that has not arrived", status: 400 };
  }

  const loaded = await loadOccurrence(
    database,
    userId,
    { taskId, scheduledOn: requested },
    timeZone,
  );
  if (isError(loaded)) return loaded;

  const status = deriveStatus(
    { kind: "routine", scheduledOn: requested, storedStatus: loaded.existing?.status ?? null },
    today,
  );
  if (status === "archived") {
    return { error: "archived occurrences are no longer completable", status: 400 };
  }

  return { on: requested };
}
