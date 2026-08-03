import type { LocalDate, Occurrence, Priority, Task } from "@sticker-collector/shared";
import { localDateIn } from "@sticker-collector/shared";

/**
 * The five home sections (prd/02-tasks.md §Home):
 *
 *   1. Missed          — routine occurrences from earlier days, still open
 *   2. General         — every one-off, dated or not
 *   3. For today       — today's routine occurrences, plus pinned captures
 *   4. Routine backlog — routine occurrences scheduled ahead
 *   5. Completed today — anything finished today, whatever it was scheduled for
 *
 * Pure on purpose. This is the one piece of the earning loop that lives only on
 * the client, and getting a task into the wrong section is both easy and
 * invisible in a screenshot.
 *
 * **An item belongs to exactly one section**, decided by the precedence in
 * `sectionFor`. Without that rule a one-off due today qualifies for two at once
 * and quietly renders twice.
 */
export interface HomeItem {
  key: string;
  task: Task;
  /** Null for an undated one-off — it is not scheduled on any day. */
  occurrence: Occurrence | null;
  scheduledOn: LocalDate | null;
  done: boolean;
}

export interface HomeSections {
  missed: HomeItem[];
  general: HomeItem[];
  forToday: HomeItem[];
  routineBacklog: HomeItem[];
  completedToday: HomeItem[];
}

const itemOf = (task: Task, occurrence: Occurrence): HomeItem => ({
  key: `${occurrence.taskId} ${occurrence.scheduledOn}`,
  task,
  occurrence,
  scheduledOn: occurrence.scheduledOn,
  done: occurrence.status === "done",
});

/**
 * Was this finished today, in the user's own day?
 *
 * `completedAt` is a UTC instant and the local day is resolved from the
 * timezone (CLAUDE.md) — slicing the first ten characters off the timestamp
 * would put anything completed late evening into tomorrow, or early morning
 * into yesterday, depending on the offset.
 *
 * Note this is deliberately **not** `scheduledOn === today`: a routine missed on
 * Monday and ticked off on Thursday was completed today, and belongs in today's
 * record of work done.
 */
function completedOn(occurrence: Occurrence, timeZone: string): LocalDate | null {
  if (occurrence.status !== "done" || !occurrence.completedAt) return null;
  return localDateIn(timeZone, new Date(occurrence.completedAt));
}

export function buildHome(
  occurrences: Occurrence[],
  tasks: Task[],
  today: LocalDate,
  timeZone: string,
): HomeSections {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const missed: HomeItem[] = [];
  const general: HomeItem[] = [];
  const forToday: HomeItem[] = [];
  const routineBacklog: HomeItem[] = [];
  const completedToday: HomeItem[] = [];

  /** Every task that already has an occurrence in the window, so the undated
   *  pass below does not list a one-off twice once it has been ticked. */
  const seen = new Set<string>();

  for (const occurrence of occurrences) {
    const task = byId.get(occurrence.taskId);
    if (!task || task.deletedAt) continue; // deleted between fetches

    // Archived is deliberately absent everywhere: it is no longer completable,
    // so putting it on a screen whose purpose is completion would be an
    // invitation the app has to refuse.
    if (occurrence.status === "archived") continue;

    const item = itemOf(task, occurrence);

    // 1. Finished today wins over every other section — including a one-off
    //    that would otherwise sit in General, which is what makes a tick move
    //    the row rather than dim it in place.
    if (completedOn(occurrence, timeZone) === today) {
      completedToday.push(item);
      seen.add(task.id);
      continue;
    }

    // Anything else that is done is history: completed on some other day, and
    // not today's business.
    if (occurrence.status === "done") {
      seen.add(task.id);
      continue;
    }

    // 2. One-offs are General regardless of their due date — a dated one-off is
    //    still a one-off, and splitting them by date is what the old Backlog
    //    did.
    if (task.type === "oneoff") {
      general.push(item);
      seen.add(task.id);
      continue;
    }

    // 3-5. Routines split by day.
    if (occurrence.scheduledOn === today) forToday.push(item);
    else if (occurrence.scheduledOn < today) {
      if (occurrence.status === "missed") missed.push(item);
    } else routineBacklog.push(item);
  }

  // Undated one-offs have no occurrence until they are ticked, so they cannot
  // come from the loop above. `lastCompletedOn` — not the fetched window —
  // decides whether one is finished, so a task completed months ago cannot
  // reappear here.
  //
  // These are also the only tasks a pin can move. The API validates a fresh
  // completion against the schedule, and an undated one-off is its single
  // exception ("completed on the day you tick it"). Pinning a routine to a day
  // its mask does not cover, or a one-off due next week, would put a row in
  // today's list that the server refuses to tick — a list you cannot work
  // through is worse than one that is merely long.
  for (const task of tasks) {
    if (task.type !== "oneoff" || task.dueAt || task.deletedAt) continue;
    if (task.lastCompletedOn || seen.has(task.id)) continue;

    const item = { key: task.id, task, occurrence: null, scheduledOn: null, done: false };
    if (task.pinnedOn === today) forToday.push(item);
    else general.push(item);
  }

  return {
    // Most recent first: yesterday's slip is the one you are most likely to
    // still care about.
    missed: missed.sort(byDateDesc),
    general: general.sort(byPriority),
    forToday: forToday.sort(byPriority),
    routineBacklog: routineBacklog.sort(byDateAsc),
    // Done work is a record, not a queue: nothing here needs doing, so the
    // alphabet is a kinder order than shouting about a finished "high".
    completedToday: completedToday.sort(byTitle),
  };
}

const byTitle = (a: HomeItem, b: HomeItem) => a.task.title.localeCompare(b.task.title);

/**
 * High first, then medium, then low — the order a list is read in.
 *
 * Priority already tints the row; sorting by it is what makes the tint worth
 * having, because the urgent work is at the top of the section instead of
 * wherever the alphabet put it. Title breaks the tie so the order is stable:
 * two mediums must not swap places between renders.
 */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const byPriority = (a: HomeItem, b: HomeItem) =>
  PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] || byTitle(a, b);

/**
 * Dated sections lead with the date and fall back to priority.
 *
 * A missed Tuesday and a missed Thursday are not the same item at different
 * urgencies — they are different days, and the day is the thing being read.
 * Within one day, priority orders them.
 */
const byDateAsc = (a: HomeItem, b: HomeItem) =>
  (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? "") || byPriority(a, b);

/**
 * Only the DATE reverses. Negating the whole comparison would reverse the
 * tiebreak with it, and put the *low*-priority item first within a day — a
 * section that reads high-first everywhere except here.
 */
const byDateDesc = (a: HomeItem, b: HomeItem) =>
  -(a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? "") || byPriority(a, b);

/** How wide a window the home screen needs: seven days back covers everything
 *  still missed (day 8 archives), and a fortnight ahead fills the Backlog. */
export const HOME_WINDOW_BACK = 7;
export const HOME_WINDOW_FORWARD = 14;
