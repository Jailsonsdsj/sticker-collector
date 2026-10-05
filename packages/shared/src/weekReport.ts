import {
  addDays,
  type LocalDate,
  localClockIn,
  occurrencesInWindow,
  type Schedule,
} from "./recurrence.js";
import type { EpicAccent } from "./schema.js";

/**
 * The weekly report: a week's routines as a grid, and everything else done in
 * it as a list.
 *
 * **Generated on Sunday at 22:00, the user's time**, and frozen from then on —
 * a week's report is evidence of how the week went, and a routine edited or
 * deleted afterwards must not rewrite it. There is no scheduler: the report is
 * built the first time it is read after that moment, and it only counts what
 * was ticked **before** it, so it says exactly what a job at 22:00 would have
 * said whenever it happens to be built.
 */

/** Sunday at 22:00, in minutes from midnight. */
export const WEEK_REPORT_MINUTE = 22 * 60;

/**
 * How one routine went on one day of the week.
 *
 * - `done`   — ticked on its own day.
 * - `late`   — its run, ticked on a later day before the report. Still a miss on
 *              its own day's grade, and work on the day it was ticked.
 * - `missed` — scheduled, and not ticked before the report.
 * - `off`    — not scheduled that day; not a day it could be missed on.
 */
export type WeekCell = "done" | "late" | "missed" | "off";

/** Names and colours are copied in, so renaming a task or an epic later does
 *  not reach a frozen report. */
export interface WeekReportRoutine {
  taskId: string;
  title: string;
  epicTitle: string | null;
  epicAccent: EpicAccent | null;
  /** Monday first, seven entries. */
  cells: WeekCell[];
}

export interface WeekReportItem {
  taskId: string;
  title: string;
  epicTitle: string | null;
  epicAccent: EpicAccent | null;
  doneOn: LocalDate;
  /** What it paid then — the frozen snapshot, not today's reward. */
  coins: number;
}

export interface WeekReport {
  /** The Monday. */
  weekStart: LocalDate;
  generatedAt: string;
  routines: WeekReportRoutine[];
  /** Everything else done that week, in the order it was done. */
  others: WeekReportItem[];
}

export interface WeekReportTask {
  id: string;
  title: string;
  type: "routine" | "oneoff";
  schedule: Schedule;
  rewardCoins: number;
  epic: { title: string; accent: EpicAccent } | null;
}

export interface WeekReportCompletion {
  taskId: string;
  scheduledOn: LocalDate;
  completedAt: string;
  rewardSnapshotCoins: number | null;
}

/** The Sunday a week report is generated on. */
export function weekReportSunday(weekStart: LocalDate): LocalDate {
  return addDays(weekStart, 6);
}

/** Whether a week's report exists yet: Sunday 22:00 has passed, the user's time. */
export function weekReportReady(weekStart: LocalDate, timeZone: string, now: Date): boolean {
  const sunday = weekReportSunday(weekStart);
  const clock = localClockIn(timeZone, now);
  return clock.date > sunday || (clock.date === sunday && clock.minutes >= WEEK_REPORT_MINUTE);
}

export function buildWeekReport(input: {
  weekStart: LocalDate;
  timeZone: string;
  tasks: readonly WeekReportTask[];
  completions: readonly WeekReportCompletion[];
  generatedAt: string;
}): WeekReport {
  const { weekStart, timeZone } = input;
  const sunday = weekReportSunday(weekStart);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Only what was ticked before Sunday 22:00 — dated once, in the user's zone.
  const ticked = new Map<string, LocalDate>();
  const before: (WeekReportCompletion & { doneOn: LocalDate })[] = [];
  for (const completion of input.completions) {
    const clock = localClockIn(timeZone, new Date(completion.completedAt));
    const inWeek = clock.date >= weekStart && clock.date <= sunday;
    const beforeReport = clock.date < sunday || clock.minutes < WEEK_REPORT_MINUTE;
    if (!inWeek || !beforeReport) continue;
    before.push({ ...completion, doneOn: clock.date });
    ticked.set(`${completion.taskId}|${completion.scheduledOn}`, clock.date);
  }

  const routines: WeekReportRoutine[] = [];
  for (const task of input.tasks) {
    if (task.type !== "routine") continue;
    const runs = new Set(occurrencesInWindow(task.schedule, weekStart, sunday));
    if (runs.size === 0) continue;

    const cells = dates.map((date): WeekCell => {
      if (!runs.has(date)) return "off";
      const doneOn = ticked.get(`${task.id}|${date}`);
      if (doneOn === undefined) return "missed";
      return doneOn === date ? "done" : "late";
    });
    routines.push({
      taskId: task.id,
      title: task.title,
      epicTitle: task.epic?.title ?? null,
      epicAccent: task.epic?.accent ?? null,
      cells,
    });
  }
  routines.sort((a, b) => a.title.localeCompare(b.title));

  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  const others: WeekReportItem[] = [];
  for (const completion of before) {
    const task = byId.get(completion.taskId);
    if (!task || task.type === "routine") continue;
    others.push({
      taskId: task.id,
      title: task.title,
      epicTitle: task.epic?.title ?? null,
      epicAccent: task.epic?.accent ?? null,
      doneOn: completion.doneOn,
      coins: completion.rewardSnapshotCoins ?? task.rewardCoins,
    });
  }
  others.sort((a, b) => a.doneOn.localeCompare(b.doneOn) || a.title.localeCompare(b.title));

  return { weekStart, generatedAt: input.generatedAt, routines, others };
}
