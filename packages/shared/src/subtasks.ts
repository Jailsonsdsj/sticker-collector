import type { LocalDate } from "./recurrence";

/**
 * A step inside a task.
 *
 * Subtasks are the **recipe**, not the work: they belong to the task, they are
 * authored with it, and ticking them earns nothing. Only the task itself is
 * completable, and only the task pays — a checklist that minted coins would be
 * a second economy with no prices in it.
 */
export interface Subtask {
  id: string;
  title: string;
  /** Author order. Gaps are legal; only the relative order is read. */
  position: number;
  /**
   * The local day it was ticked, or null.
   *
   * **A date, not a boolean** — the same choice `task.pinned_on` makes, for the
   * same reason. A routine is a new thing every day, so "done" has to be a
   * statement about a day and stop being true tomorrow without anything having
   * to clear it. Nothing runs at midnight in this app, and the one feature that
   * assumed something did (`startedAt`) is the bug this avoids by construction.
   */
  doneOn: LocalDate | null;
}

/** The most a task may carry, so one create stays inside a single D1 batch. */
export const MAX_SUBTASKS = 50;

/**
 * Whether a step counts as done **now**.
 *
 * A routine's checklist resets each day: ticked yesterday is not ticked today,
 * because today is a different run of the same routine. A one-off has no next
 * day — there is one of it, and a step done on it stays done until the whole
 * thing is finished — so any date means done.
 */
export function subtaskDone(
  subtask: Pick<Subtask, "doneOn">,
  taskType: "routine" | "oneoff",
  today: LocalDate,
): boolean {
  if (!subtask.doneOn) return false;
  return taskType === "oneoff" ? true : subtask.doneOn === today;
}

/** How many of them are done, for the "2 of 5" a reader wants before counting. */
export function subtasksDone(
  subtasks: readonly Subtask[],
  taskType: "routine" | "oneoff",
  today: LocalDate,
): number {
  return subtasks.filter((subtask) => subtaskDone(subtask, taskType, today)).length;
}

/**
 * **Undone first**, each group in the author's own order.
 *
 * What is left is the list you are working through; what is done is the record
 * of having done it. Sorting by `position` alone leaves the next step buried
 * among ticked ones, which is the list refusing to answer the only question
 * being asked of it.
 *
 * Stable within each group: two steps never swap places just because a third
 * was ticked.
 */
export function orderSubtasks(
  subtasks: readonly Subtask[],
  taskType: "routine" | "oneoff",
  today: LocalDate,
): Subtask[] {
  return [...subtasks].sort((a, b) => {
    const aDone = subtaskDone(a, taskType, today);
    const bDone = subtaskDone(b, taskType, today);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.position - b.position;
  });
}
