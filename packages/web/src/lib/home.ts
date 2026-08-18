import type { LocalDate, Occurrence, Priority, Task } from "@sticker-collector/shared";
import { localDateIn } from "@sticker-collector/shared";

/**
 * The five home sections (prd/02-tasks.md §Home):
 *
 *   0. In progress      — anything started, whatever day it belongs to
 *   1. Missed          — one-offs whose due date has gone
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
  inProgress: HomeItem[];
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

  const inProgress: HomeItem[] = [];
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

    // 2. Started work outranks the day it belongs to — but **once**.
    //
    //    `startedAt` is a property of the TASK, and a routine is many rows: one
    //    per day in the window. Sending every one of them here put the same
    //    title in the list five times over, which is what starting a routine
    //    looked like from the outside.
    //
    //    A routine therefore contributes only TODAY's occurrence. Its other
    //    days keep their own meaning — tomorrow is still backlog, and a day
    //    that has gone belongs to the Week tab — and a routine not scheduled
    //    today contributes nothing, which is also the honest answer: there is
    //    no day to tick.
    //
    //    A one-off has a single occurrence, so it comes here whatever date it
    //    carries.
    if (task.startedAt && (task.type === "oneoff" || occurrence.scheduledOn === today)) {
      inProgress.push(item);
      seen.add(task.id);
      continue;
    }

    // 3. A one-off whose due date has GONE is missed; every other one-off is
    //    General.
    //
    //    This is the only thing that can be missed now. A routine leaves one
    //    open day per day it was not ticked, and a week of those buried the
    //    screen — they are read and ticked on the Week tab instead. An overdue
    //    capture is different: there is exactly one of it, it is not going to
    //    reappear tomorrow, and it is the thing most likely to have been
    //    forgotten.
    if (task.type === "oneoff") {
      // `task.dueAt`, not merely an old occurrence date: an UNDATED capture
      // cannot be overdue. Unticking leaves a pending row behind, so without
      // this a one-off ticked and untangled last week would reappear as
      // "missed" — a deadline it never had.
      if (task.dueAt && occurrence.scheduledOn < today) missed.push(item);
      else general.push(item);
      seen.add(task.id);
      continue;
    }

    // 3-4. Routines split by day — and a day that has GONE is not one of them.
    //
    // Every routine leaves one missed row per day it was not ticked, so a
    // handful of daily habits filled the screen with a week of history that
    // grew every morning: reference material, on the screen whose job is what
    // is left today. Those days are still completable, on the Week tab, where a
    // week is the unit and ticking a past box is the point.
    if (occurrence.scheduledOn === today) forToday.push(item);
    else if (occurrence.scheduledOn > today) routineBacklog.push(item);
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
    if (task.startedAt) inProgress.push(item);
    else if (task.pinnedOn === today) forToday.push(item);
    else general.push(item);
  }

  return {
    inProgress: inProgress.sort(byPriority),
    // Most overdue first: the one that slipped furthest is the one most likely
    // to have been forgotten.
    missed: missed.sort(byDateAsc),
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
 * Two different days are not the same item at two urgencies — the day is the
 * thing being read. Within one day, priority orders them.
 */
const byDateAsc = (a: HomeItem, b: HomeItem) =>
  (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? "") || byPriority(a, b);

/** How wide a window the home screen needs: seven days back covers everything
 *  still open (day 8 archives) — the Week tab reads that history — and a
 *  fortnight ahead fills the Backlog. */
export const HOME_WINDOW_BACK = 7;
export const HOME_WINDOW_FORWARD = 14;

/**
 * Narrowing the whole screen to what matches a search.
 *
 * Applied to the built sections rather than to the tasks going in, so a match
 * keeps the section it belongs to: finding a routine tells you it is in the
 * backlog, not merely that it exists. Sections that end up empty render
 * nothing, so the shape of the answer is the answer.
 *
 * **Title only.** Matching descriptions as well would put rows on screen with
 * no visible reason to be there, and the honest fix for that — highlighting the
 * matched text inside a collapsed description — is a different feature.
 */
export function filterHome(sections: HomeSections, query: string): HomeSections {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;

  const keep = (items: HomeItem[]) =>
    items.filter((item) => item.task.title.toLowerCase().includes(needle));

  return {
    inProgress: keep(sections.inProgress),
    missed: keep(sections.missed),
    forToday: keep(sections.forToday),
    general: keep(sections.general),
    completedToday: keep(sections.completedToday),
    routineBacklog: keep(sections.routineBacklog),
  };
}

/** Whether any section has anything in it — "no matches" needs saying. */
export function isEmpty(sections: HomeSections): boolean {
  return Object.values(sections).every((items) => items.length === 0);
}
