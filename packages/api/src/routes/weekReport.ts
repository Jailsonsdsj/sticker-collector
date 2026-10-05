import {
  addDays,
  buildWeekReport,
  type EpicAccent,
  localDateSchema,
  scheduleOf,
  type WeekReport,
  weekdayOf,
  weekReportReady,
  weekReportSunday,
} from "@sticker-collector/shared";
import { and, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { epic, occurrence, task, weekReport } from "../db/schema";
import { listGeneratingTasks } from "../lib/tasks";
import { timeZoneOf } from "../lib/user";
import { requireAuth } from "../middleware/require-auth";

export const weekReportRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

weekReportRoutes.use("*", requireAuth);

/**
 * GET /api/reports/week/:weekStart
 *
 * The week's report: its routines as a grid, everything else done as a list.
 *
 * **409 until Sunday 22:00, the user's time** — that is when the report is
 * made, and showing a half-built week as if it were the report would be a
 * report that changes after it was read.
 *
 * After that it is built **once**, on the first read, stored, and served from
 * the table ever after: a frozen account of the week that no later edit to a
 * routine can rewrite. A GET that writes, like the momentum report — there is
 * no scheduler to do it at 22:00, and the builder ignores every tick after
 * 22:00, so building it later says exactly what building it then would have.
 */
weekReportRoutes.get("/week/:weekStart", async (c) => {
  const parsed = localDateSchema.safeParse(c.req.param("weekStart"));
  if (!parsed.success || weekdayOf(parsed.data) !== 0) {
    return c.json({ error: "weekStart must be a Monday, YYYY-MM-DD" }, 400);
  }
  const weekStart = parsed.data;

  const database = db(c.env);
  const userId = c.get("userId");
  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  if (!weekReportReady(weekStart, timeZone, new Date())) {
    return c.json({ error: "this week's report is made on Sunday at 22:00" }, 409);
  }

  const stored = await readStored(database, userId, weekStart);
  if (stored) return c.json(stored);

  const sunday = weekReportSunday(weekStart);
  const [tasks, epics, completions] = await Promise.all([
    listGeneratingTasks(database, userId),
    database.select().from(epic).where(eq(epic.userId, userId)),
    // By tick time, a day of margin each side for every timezone: a late run
    // and an overdue one-off are both filed under an earlier scheduled date.
    database
      .select({
        taskId: occurrence.taskId,
        scheduledOn: occurrence.scheduledOn,
        completedAt: occurrence.completedAt,
        rewardSnapshotCoins: occurrence.rewardSnapshotCoins,
      })
      .from(occurrence)
      .innerJoin(task, eq(task.id, occurrence.taskId))
      .where(
        and(
          eq(task.userId, userId),
          eq(occurrence.status, "done"),
          gte(occurrence.completedAt, `${addDays(weekStart, -1)}T00:00:00.000Z`),
          lt(occurrence.completedAt, `${addDays(sunday, 2)}T00:00:00.000Z`),
        ),
      ),
  ]);

  const epicById = new Map(epics.map((row) => [row.id, row]));
  const report = buildWeekReport({
    weekStart,
    timeZone,
    generatedAt: new Date().toISOString(),
    tasks: tasks.map((row) => {
      const owner = row.epicId ? epicById.get(row.epicId) : undefined;
      return {
        id: row.id,
        title: row.title,
        type: row.type,
        schedule: scheduleOf(row, timeZone),
        rewardCoins: row.rewardCoins,
        epic: owner ? { title: owner.title, accent: owner.accent as EpicAccent } : null,
      };
    }),
    completions: completions.flatMap((row) =>
      row.completedAt ? [{ ...row, completedAt: row.completedAt }] : [],
    ),
  });

  // OR IGNORE: two first reads racing must not fail, and the first one stands.
  const inserted = await database
    .insert(weekReport)
    .values({ userId, weekStart, body: JSON.stringify(report), generatedAt: report.generatedAt })
    .onConflictDoNothing();
  if (inserted.meta.changes === 0) {
    return c.json((await readStored(database, userId, weekStart)) ?? report);
  }
  return c.json(report);
});

async function readStored(
  database: ReturnType<typeof db>,
  userId: string,
  weekStart: string,
): Promise<WeekReport | null> {
  const [row] = await database
    .select({ body: weekReport.body })
    .from(weekReport)
    .where(and(eq(weekReport.userId, userId), eq(weekReport.weekStart, weekStart)))
    .limit(1);
  return row ? (JSON.parse(row.body) as WeekReport) : null;
}
