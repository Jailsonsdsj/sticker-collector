import type { LocalDate, Task } from "@sticker-collector/shared";
import { localDateIn } from "@sticker-collector/shared";
import { startedToday } from "./home";

export type TaskStatus = "done" | "inProgress" | "missed" | "refine" | "todo";

/**
 * A task's status as one word, for lists that show tasks rather than days.
 *
 * Derived, never stored, with the same precedence Home uses: finished beats
 * started, started beats overdue, and Refine only labels what is otherwise To
 * do — the same undated one-offs Home lists under Refine. "Missed" is a one-off whose due date has
 * gone — an undated capture cannot be missed, and a routine's missed days are
 * the Week tab's business, not a property of the task.
 *
 * Due dates are compared in the user's timezone, so a task due late this
 * evening does not read as missed just because UTC has already moved on.
 */
export function taskStatus(
  task: Pick<Task, "type" | "startedAt" | "dueAt" | "lastCompletedOn" | "refining">,
  today: LocalDate,
  timeZone: string,
): TaskStatus {
  if (task.lastCompletedOn) return "done";
  if (startedToday(task, today, timeZone)) return "inProgress";
  if (task.type === "oneoff" && task.dueAt && localDateIn(timeZone, new Date(task.dueAt)) < today) {
    return "missed";
  }
  if (task.refining && task.type === "oneoff" && !task.dueAt) return "refine";
  return "todo";
}
