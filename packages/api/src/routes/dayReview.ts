import { addDays, localDateIn, localDateSchema, type Occurrence } from "@sticker-collector/shared";
import { and, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { occurrence, task } from "../db/schema";
import { timeZoneOf } from "../lib/user";
import { requireAuth } from "../middleware/require-auth";

export const dayReviewRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

dayReviewRoutes.use("*", requireAuth);

/**
 * GET /api/reports/day/:date
 *
 * Everything ticked **on** a day, by the user's clock — whatever run it
 * belonged to. A Monday routine ticked on Wednesday is Wednesday's work, and a
 * one-off finished a fortnight after its due date is the day it was finished.
 *
 * The occurrence window cannot answer this: it is keyed by the scheduled date,
 * so a one-day window for Wednesday never sees Monday's run, and an overdue
 * one-off can sit any distance before it.
 *
 * Read by the tick time over a day of margin each side — every timezone's
 * civil day fits inside it — then narrowed to the exact civil date.
 */
dayReviewRoutes.get("/day/:date", async (c) => {
  const parsed = localDateSchema.safeParse(c.req.param("date"));
  if (!parsed.success) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const date = parsed.data;

  const database = db(c.env);
  const userId = c.get("userId");
  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  const rows = await database
    .select({
      taskId: occurrence.taskId,
      scheduledOn: occurrence.scheduledOn,
      status: occurrence.status,
      completedAt: occurrence.completedAt,
      rewardSnapshotCoins: occurrence.rewardSnapshotCoins,
    })
    .from(occurrence)
    .innerJoin(task, eq(task.id, occurrence.taskId))
    .where(
      and(
        eq(task.userId, userId),
        eq(occurrence.status, "done"),
        gte(occurrence.completedAt, `${addDays(date, -1)}T00:00:00.000Z`),
        lt(occurrence.completedAt, `${addDays(date, 2)}T00:00:00.000Z`),
      ),
    );

  const body: Occurrence[] = rows.filter(
    (row) => row.completedAt && localDateIn(timeZone, new Date(row.completedAt)) === date,
  );
  return c.json(body);
});
