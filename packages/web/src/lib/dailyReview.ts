import type { DayTally, Epic, LocalDate, Occurrence, Task } from "@sticker-collector/shared";
import { dayScore, localDateIn } from "@sticker-collector/shared";

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
 * The list comes from `GET /api/reports/day/:date` — everything ticked ON the
 * day, whatever run it belonged to. **The score is not computed here.** It is
 * the day as the server froze it when the day closed (`day_score`), handed in
 * from the momentum report, so the modal and the calendar can never disagree
 * and a later edit to a routine can never rewrite a day that has passed.
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
  /**
   * What the day held and what got done, **in minutes** — the two numbers the
   * score is a proportion of. Named for the fraction they print, not for the
   * tasks behind them: the score weighs time, so the caption has to as well or
   * it contradicts the number above it.
   */
  scheduled: number;
  done: number;
}

export function buildReview(
  date: LocalDate,
  occurrences: readonly Occurrence[],
  tasks: readonly Task[],
  epics: readonly Epic[],
  timeZone: string,
  /** The day as the momentum report has it — frozen once it has closed. */
  day?: DayTally,
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

  return {
    date,
    rows,
    coins: rows.reduce((sum, row) => sum + row.coins, 0),
    // No day yet — the report is still loading — is no score, never a guess.
    score: day ? dayScore(day) : null,
    scheduled: day?.scheduledMinutes ?? 0,
    done: day?.doneMinutes ?? 0,
  };
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
