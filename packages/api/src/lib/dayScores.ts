import {
  addDays,
  type DayTally,
  type DoneEntry,
  type FrozenDay,
  type LocalDate,
  localDateIn,
} from "@sticker-collector/shared";
import { and, eq, gte } from "drizzle-orm";
import type { db } from "../db/client";
import { dayScore } from "../db/schema";

type Database = ReturnType<typeof db>;

/**
 * Seven binds a row, under D1's 100-parameter ceiling: fourteen rows per
 * statement.
 */
const ROWS_PER_INSERT = Math.floor(100 / 7);

/** The closed days already stored for this user, from `from` on. */
export async function loadFrozen(
  database: Database,
  userId: string,
  from: LocalDate,
): Promise<FrozenDay[]> {
  return database
    .select({
      date: dayScore.date,
      scheduled: dayScore.scheduled,
      done: dayScore.done,
      scheduledMinutes: dayScore.scheduledMinutes,
      doneMinutes: dayScore.doneMinutes,
    })
    .from(dayScore)
    .where(and(eq(dayScore.userId, userId), gte(dayScore.date, from)));
}

/**
 * The earliest day in `[from, today)` with no frozen row, or `today` when
 * every closed day is stored.
 *
 * Everything before it is already evidence, so nothing before it needs
 * computing — which is what keeps the report inside its CPU budget once the
 * first backfill is done: usually this is yesterday or today.
 */
export function firstOpenDay(
  frozen: readonly FrozenDay[],
  days: readonly LocalDate[],
  today: LocalDate,
): LocalDate {
  const stored = new Set(frozen.map((day) => day.date));
  return days.find((date) => date < today && !stored.has(date)) ?? today;
}

/**
 * Store every closed day that has no row yet.
 *
 * `INSERT OR IGNORE`: two reports racing to close the same day must not fail,
 * and the first one's row is the one that stands — the table is append-only
 * (`day_score_no_update`), so the second could not overwrite it anyway.
 *
 * Today is never written. It has not closed, and a grade stored mid-day would
 * freeze an afternoon's work out of it.
 */
export async function freezeClosedDays(
  database: Database,
  userId: string,
  days: readonly DayTally[],
  frozen: readonly FrozenDay[],
  today: LocalDate,
): Promise<void> {
  const stored = new Set(frozen.map((day) => day.date));
  const frozenAt = new Date().toISOString();
  const rows = days
    .filter((day) => day.date < today && !stored.has(day.date))
    .map((day) => ({
      userId,
      date: day.date,
      scheduled: day.scheduled,
      done: day.done,
      scheduledMinutes: day.scheduledMinutes,
      doneMinutes: day.doneMinutes,
      frozenAt,
    }));
  if (rows.length === 0) return;

  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    statements.push(
      database
        .insert(dayScore)
        .values(rows.slice(i, i + ROWS_PER_INSERT))
        .onConflictDoNothing(),
    );
  }
  await database.batch(statements as unknown as Parameters<typeof database.batch>[0]);
}

/**
 * The year's completions, twice over: by scheduled day for streaks, and by the
 * day they were done for grades.
 *
 * Only completions that can land on an open day are given a done-day. Every
 * day before `open` is frozen, and dating a year of completions in the user's
 * timezone is the most expensive thing this report would otherwise do. A day
 * of margin covers every timezone ahead of UTC.
 */
export function datedCompletions(
  rows: readonly { taskId: string; scheduledOn: LocalDate; completedAt: string | null }[],
  open: LocalDate,
  timeZone: string,
): { completions: Map<string, Set<LocalDate>>; done: DoneEntry[] } {
  const cutoff = `${addDays(open, -1)}T00:00:00.000Z`;
  const completions = new Map<string, Set<LocalDate>>();
  const done: DoneEntry[] = [];
  for (const row of rows) {
    const days = completions.get(row.taskId) ?? new Set<LocalDate>();
    days.add(row.scheduledOn);
    completions.set(row.taskId, days);
    if (row.completedAt && row.completedAt >= cutoff) {
      done.push({
        taskId: row.taskId,
        scheduledOn: row.scheduledOn,
        doneOn: localDateIn(timeZone, new Date(row.completedAt)),
      });
    }
  }
  return { completions, done };
}
