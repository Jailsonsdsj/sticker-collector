import {
  addDays,
  type EarnedCoins,
  type EffortReport,
  effortByEpic,
  effortByMonth,
  effortByWeek,
  type LocalDate,
  localDateIn,
  MAX_HISTORY_DAYS,
  type MomentumReport,
  momentumReport,
  type ReportTask,
  stickersOverTime,
  todayIn,
} from "@sticker-collector/shared";
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, holding, ledger, occurrence, sticker, task } from "../db/schema";
import { scheduleOf } from "../lib/occurrences";
import { listGeneratingTasks } from "../lib/tasks";
import { timeZoneOf } from "../lib/user";
import { requireAuth } from "../middleware/require-auth";

export const reportRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

reportRoutes.use("*", requireAuth);

/**
 * GET /api/reports/momentum
 *
 * Streaks, perfect days, trailing completion rates and the weekday shape.
 *
 * A read, and only a read: no idempotency key, and nothing is written. The
 * aggregates are computed by `shared/reports.ts` from two facts — which days
 * each task was scheduled (derived from the mask, since occurrence rows exist
 * only once something is completed) and which days it was done.
 *
 * The window is a year, matching `MAX_HISTORY_DAYS`. Everything the report says
 * is bounded by it, which is what keeps a three-year-old routine inside the
 * 10 ms CPU budget.
 */
reportRoutes.get("/momentum", async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  // "Today" is the user's civil date, never the server's.
  const today = todayIn(timeZone);
  const from = addDays(today, -(MAX_HISTORY_DAYS - 1));

  // Deleted tasks generate nothing, so they contribute no scheduled days —
  // the same predicate the occurrence window uses.
  const tasks = await listGeneratingTasks(database, userId);

  // Only completions matter: a stored `missed` or `archived` row is not a
  // completion, and `pending` is never authoritative when stored.
  // `occurrence` has no user column — ownership runs through the task, so the
  // live task ids are what scopes this. A deleted task's history stays in the
  // table and is simply not asked for.
  const taskIds = tasks.map((task) => task.id);
  const rows =
    taskIds.length === 0
      ? []
      : await database
          .select({ taskId: occurrence.taskId, scheduledOn: occurrence.scheduledOn })
          .from(occurrence)
          .where(
            and(
              inArray(occurrence.taskId, taskIds),
              eq(occurrence.status, "done"),
              gte(occurrence.scheduledOn, from),
            ),
          );

  const completions = new Map<string, Set<LocalDate>>();
  for (const row of rows) {
    const days = completions.get(row.taskId) ?? new Set<LocalDate>();
    days.add(row.scheduledOn);
    completions.set(row.taskId, days);
  }

  const reportTasks: ReportTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    schedule: scheduleOf(task, timeZone),
  }));

  const body: MomentumReport = momentumReport({ tasks: reportTasks, completions, today });
  return c.json(body);
});

/**
 * GET /api/reports/effort
 *
 * Minutes invested by week and month, effort by epic, the collection growing,
 * and the shelf of finished albums.
 *
 * Everything comes from rows that already exist: the ledger, `first_acquired_at`
 * on a holding, and `completed_at` on an album. No new tracking, which is the
 * whole constraint on this report.
 */
reportRoutes.get("/effort", async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");
  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  const today = todayIn(timeZone);
  const from = addDays(today, -(MAX_HISTORY_DAYS - 1));

  // Minutes come from the ledger, not from occurrence snapshots: uncompleting
  // appends a NEGATIVE task_reward and leaves the snapshot intact, so a
  // snapshot sum would count work that was taken back. The ledger nets out.
  const earned = await database
    .select({
      createdAt: ledger.createdAt,
      scheduledOn: occurrence.scheduledOn,
      amountCoins: ledger.amountCoins,
      epicId: task.epicId,
    })
    .from(ledger)
    .leftJoin(occurrence, eq(occurrence.id, ledger.occurrenceId))
    .leftJoin(task, eq(task.id, occurrence.taskId))
    .where(and(eq(ledger.userId, userId), eq(ledger.reason, "task_reward")));

  const earnings: EarnedCoins[] = earned.map((row) => ({
    // Dated by the day the work was *scheduled*, not by when the row was
    // written. A reversal is appended at the moment the user corrects the
    // mistake, so dating by `created_at` would leave the original week
    // overstated and push a negative into the week the correction happened in.
    // Falling back to `created_at` covers a reward with no occurrence behind it.
    date: row.scheduledOn ?? localDateIn(timeZone, new Date(row.createdAt)),
    amountCoins: row.amountCoins,
    epicId: row.epicId ?? null,
  }));

  const acquired = await database
    .select({ firstAcquiredAt: holding.firstAcquiredAt })
    .from(holding)
    .innerJoin(sticker, eq(sticker.id, holding.stickerId))
    .innerJoin(album, eq(album.id, sticker.albumId))
    .where(and(eq(album.userId, userId), isNull(album.deletedAt)));

  const finished = await database
    .select({
      albumId: album.id,
      title: album.title,
      coverKey: album.coverKey,
      completedAt: album.completedAt,
    })
    .from(album)
    .where(and(eq(album.userId, userId), isNull(album.deletedAt), isNotNull(album.completedAt)));

  const shelf = finished
    .map((row) => ({
      albumId: row.albumId,
      title: row.title,
      coverKey: row.coverKey,
      completedOn: localDateIn(timeZone, new Date(row.completedAt as string)),
    }))
    .sort((a, b) => b.completedOn.localeCompare(a.completedOn));

  const body: EffortReport = {
    today,
    weeks: effortByWeek(earnings, from, today),
    months: effortByMonth(earnings, from, today),
    epics: effortByEpic(earnings),
    collection: stickersOverTime(
      acquired.map((row) => localDateIn(timeZone, new Date(row.firstAcquiredAt))),
      addDays(today, -89),
      today,
    ),
    albumsCompleted: shelf.length,
    shelf,
  };
  return c.json(body);
});
