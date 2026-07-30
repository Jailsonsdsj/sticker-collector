import type { LocalDate, Occurrence, Task } from "@sticker-collector/shared";

/**
 * The three home sections (prd/02-tasks.md §Home), in spec order:
 *
 *   1. Missed   — routine occurrences from earlier days, and overdue one-offs
 *   2. Today    — today's routine occurrences and today's dated one-offs
 *   3. Backlog  — undated one-offs, and anything scheduled ahead
 *
 * Pure on purpose. This is the one piece of the earning loop that lives only on
 * the client, and getting a task into the wrong section is both easy and
 * invisible in a screenshot.
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
  today: HomeItem[];
  backlog: HomeItem[];
}

const itemOf = (task: Task, occurrence: Occurrence): HomeItem => ({
  key: `${occurrence.taskId} ${occurrence.scheduledOn}`,
  task,
  occurrence,
  scheduledOn: occurrence.scheduledOn,
  done: occurrence.status === "done",
});

export function buildHome(
  occurrences: Occurrence[],
  tasks: Task[],
  today: LocalDate,
): HomeSections {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const missed: HomeItem[] = [];
  const todaySection: HomeItem[] = [];
  const ahead: HomeItem[] = [];

  for (const occurrence of occurrences) {
    const task = byId.get(occurrence.taskId);
    if (!task) continue; // deleted between fetches

    // Archived is deliberately absent from all three: it is no longer
    // completable, so putting it on a screen whose purpose is completion would
    // be an invitation the app has to refuse.
    if (occurrence.status === "archived") continue;

    if (occurrence.scheduledOn === today) todaySection.push(itemOf(task, occurrence));
    else if (occurrence.scheduledOn < today) {
      if (occurrence.status === "missed") missed.push(itemOf(task, occurrence));
    } else ahead.push(itemOf(task, occurrence));
  }

  // Undated one-offs live only in the Backlog and have no occurrence until they
  // are ticked. `lastCompletedOn` — not the fetched window — decides whether one
  // is finished, so a task completed months ago cannot reappear here.
  const undated: HomeItem[] = tasks
    .filter((t) => t.type === "oneoff" && !t.dueAt && !t.deletedAt && !t.lastCompletedOn)
    .map((task) => ({ key: task.id, task, occurrence: null, scheduledOn: null, done: false }));

  return {
    // Most recent first: yesterday's slip is the one you are most likely to
    // still care about.
    missed: missed.sort(byDateDesc),
    today: todaySection.sort(byTitle),
    backlog: [...undated.sort(byTitle), ...ahead.sort(byDateAsc)],
  };
}

const byTitle = (a: HomeItem, b: HomeItem) => a.task.title.localeCompare(b.task.title);
const byDateAsc = (a: HomeItem, b: HomeItem) =>
  (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? "") || byTitle(a, b);
const byDateDesc = (a: HomeItem, b: HomeItem) => -byDateAsc(a, b);

/** How wide a window the home screen needs: seven days back covers everything
 *  still missed (day 8 archives), and a fortnight ahead fills the Backlog. */
export const HOME_WINDOW_BACK = 7;
export const HOME_WINDOW_FORWARD = 14;
