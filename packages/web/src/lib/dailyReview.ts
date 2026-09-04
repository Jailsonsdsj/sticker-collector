import type { Epic, LocalDate, Occurrence, Task } from "@sticker-collector/shared";
import { dailyTally, dayScore, localDateIn, scheduleOf } from "@sticker-collector/shared";

/**
 * What you finished on a given day, in the three things worth reading back:
 * the title, the epic it belonged to, and what it paid.
 *
 * **Nothing new is stored for this.** The occurrence already carries the coins
 * it paid — frozen at completion, because editing a task's reward must never
 * rewrite history — and the task carries its title and epic. Copying those into
 * a "daily summary" table would be a second source of truth for facts the
 * database already holds, and the first thing to drift the day a task is
 * renamed.
 *
 * The cost of deriving it is one occurrence query per day looked at, which is
 * the same query the home screen already makes.
 */
export interface ReviewRow {
  taskId: string;
  title: string;
  /** The epic's title, or null for unassigned work. */
  epic: string | null;
  epicAccent: string | null;
  coins: number;
}

export interface DailyReview {
  date: LocalDate;
  rows: ReviewRow[];
  coins: number;
  /**
   * How much of the day got done, 0–100, or `null` when it held nothing.
   *
   * `null` rather than 0, the rule every other measure in this app follows: a
   * day with nothing scheduled is not a day you failed, and scoring it zero
   * would punish taking a Sunday off.
   */
  score: number | null;
  /** What the day held, for the "3 of 4" the score is short for. */
  scheduled: number;
  done: number;
}

export function buildReview(
  date: LocalDate,
  occurrences: readonly Occurrence[],
  tasks: readonly Task[],
  epics: readonly Epic[],
  timeZone: string,
): DailyReview {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const epicById = new Map(epics.map((epic) => [epic.id, epic]));

  const rows: ReviewRow[] = [];
  for (const occurrence of occurrences) {
    // Completed ON that day, by the user's clock — not scheduled for it. A
    // Monday routine ticked on Thursday belongs to Thursday's review, the same
    // rule "Completed today" follows.
    if (occurrence.status !== "done" || !occurrence.completedAt) continue;
    if (localDateIn(timeZone, new Date(occurrence.completedAt)) !== date) continue;

    const task = taskById.get(occurrence.taskId);
    if (!task) continue;

    const epic = task.epicId ? epicById.get(task.epicId) : undefined;
    rows.push({
      taskId: task.id,
      title: task.title,
      epic: epic?.title ?? null,
      epicAccent: epic?.accent ?? null,
      // The snapshot, never the task's current reward: what it paid then is
      // the only honest number to show.
      coins: occurrence.rewardSnapshotCoins ?? task.rewardCoins,
    });
  }

  rows.sort((a, b) => b.coins - a.coins || a.title.localeCompare(b.title));

  // What the day HELD, which is the denominator the score compares against.
  // Derived from the schedule rather than counted from occurrence rows: a row
  // exists only once something is completed or archived, so counting rows would
  // make every day 100% by construction.
  //
  // `scheduleOf` is the server's own function, moved into `shared` for this —
  // a second opinion here on when a routine starts counting would be a second
  // opinion on a rule that already has a bug named after it.
  const tally = dailyTally(
    {
      tasks: tasks
        .filter((task) => !task.deletedAt)
        .map((task) => ({ id: task.id, title: task.title, schedule: scheduleOf(task, timeZone) })),
      completions: completionsByTask(occurrences, timeZone),
      today: date,
    },
    date,
    date,
  );
  const day = tally[0] ?? { date, scheduled: 0, done: 0 };

  return {
    date,
    rows,
    coins: rows.reduce((sum, row) => sum + row.coins, 0),
    score: dayScore(day),
    scheduled: day.scheduled,
    done: day.done,
  };
}

/**
 * Which days each task was completed on, keyed by task.
 *
 * By the day it was **scheduled for**, not the day it was ticked — that is what
 * `dailyTally` compares against the schedule, and a Monday routine ticked on
 * Thursday still fills Monday's slot. The review's own list is dated the other
 * way round (see above), and the two are answering different questions: what
 * you did today, versus how much of a given day got done.
 */
function completionsByTask(
  occurrences: readonly Occurrence[],
  _timeZone: string,
): Map<string, Set<LocalDate>> {
  const byTask = new Map<string, Set<LocalDate>>();
  for (const occurrence of occurrences) {
    if (occurrence.status !== "done") continue;
    const days = byTask.get(occurrence.taskId) ?? new Set<LocalDate>();
    days.add(occurrence.scheduledOn);
    byTask.set(occurrence.taskId, days);
  }
  return byTask;
}

/**
 * When the review was last shown, so it appears once a day and not on every
 * navigation.
 *
 * `localStorage`, like the other per-device UI state: which day you have
 * already been shown is not a fact about the account, and it must not ride
 * along in a backup.
 */
const STORAGE_KEY = "sc_reviewed_on";

export function lastReviewedOn(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markReviewed(date: LocalDate): void {
  try {
    localStorage.setItem(STORAGE_KEY, date);
  } catch {
    // Private mode: the review shows again next launch, which is a smaller
    // failure than not showing it at all.
  }
}

/**
 * Should today's first visit open the review?
 *
 * Only once per day, and only when there is something to celebrate — a modal
 * that opens to say "you did nothing yesterday" is a punishment, not a review.
 */
export function shouldReview(today: LocalDate, review: DailyReview): boolean {
  return review.rows.length > 0 && lastReviewedOn() !== today;
}
