import { occurrenceWindowQuerySchema, todayIn } from "@sticker-collector/shared";
import { and, between, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { ledger, occurrence } from "../db/schema";
import { completionGuard, resolveOccurrence, rewardFor } from "../lib/complete";
import {
  MAX_WINDOW_DAYS,
  materialiseWindow,
  type OccurrenceRow,
  windowDays,
} from "../lib/occurrences";
import { selectIn } from "../lib/selectIn";
import { listGeneratingTasks } from "../lib/tasks";
import { timeZoneOf } from "../lib/user";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

export const occurrenceRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

occurrenceRoutes.use("*", requireAuth);
// GET never claims a key — it writes nothing. The two POSTs mint or reverse
// coins, so a retried tap must not pay twice.
occurrenceRoutes.on(["POST"], "*", idempotency);

/**
 * GET /api/occurrences?from&to
 *
 * Lazy materialisation (architecture.md §0.3). Occurrences for the window are
 * computed by walking each live task's schedule and LEFT JOINing the rows that
 * actually exist. The future is never written.
 */
occurrenceRoutes.get("/", async (c) => {
  const parsed = occurrenceWindowQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "bad request", issues: parsed.error.issues }, 400);
  const { from, to } = parsed.data;

  if (windowDays(from, to) > MAX_WINDOW_DAYS) {
    return c.json({ error: `window must not exceed ${MAX_WINDOW_DAYS} days` }, 400);
  }

  const userId = c.get("userId");
  const database = db(c.env);

  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  // "Today" is the user's civil date, resolved from their timezone — never the
  // server's. This is what deletes the midnight race and the "flew to Lisbon"
  // bug class the cron job would have had.
  const today = todayIn(timeZone);

  const tasks = await listGeneratingTasks(database, userId);
  if (tasks.length === 0) return c.json([]);

  // Chunked, because `IN (?, …)` counts against D1's 100-parameter ceiling:
  // with a hundred live tasks this statement was rejected outright and the
  // whole home screen answered 500.
  const stored: OccurrenceRow[] = await selectIn(
    tasks.map((t) => t.id),
    (batch) =>
      database
        .select({
          taskId: occurrence.taskId,
          scheduledOn: occurrence.scheduledOn,
          status: occurrence.status,
          completedAt: occurrence.completedAt,
          rewardSnapshotCoins: occurrence.rewardSnapshotCoins,
        })
        .from(occurrence)
        .where(and(inArray(occurrence.taskId, batch), between(occurrence.scheduledOn, from, to))),
  );

  return c.json(materialiseWindow({ tasks, stored, timeZone, today, from, to }));
});

/**
 * POST /api/occurrences/complete — tick a day, mint its coins.
 *
 * The occurrence row and the ledger row go in ONE `db.batch([...])`. D1 has no
 * interactive transactions (§4.2), so this is the only way the two stay in
 * step: if the occurrence insert loses a race on the unique index, the batch
 * rolls back and no coins are minted.
 *
 * Earning is a plain append, not `spend()` — that helper is for debits, where
 * the balance guard has to live inside the SQL (§4.3).
 */
occurrenceRoutes.post("/complete", async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);

  const r = await resolveOccurrence(database, userId, await c.req.json().catch(() => null));
  if (!r.ok) return c.json({ error: r.error, issues: r.issues }, r.status);

  const refused = completionGuard(r.loaded, r.today, r.ref.scheduledOn);
  if (refused) return c.json({ error: refused.error }, refused.status);

  // The real instant of completion. `scheduled_on` keeps the day the work was
  // FOR; this is the day it actually happened. Reports must never claim work
  // happened on a day it did not (prd/02-tasks.md §Missed work).
  const now = new Date().toISOString();
  const coins = rewardFor(r.loaded);
  const existing = r.loaded.existing;
  const occurrenceId = existing?.id ?? crypto.randomUUID();

  // An existing row means this day was completed and re-opened before, so its
  // snapshot is already frozen — update around it rather than rewriting it.
  const writeOccurrence = existing
    ? database
        .update(occurrence)
        .set({ status: "done", completedAt: now })
        .where(eq(occurrence.id, occurrenceId))
    : database.insert(occurrence).values({
        id: occurrenceId,
        taskId: r.ref.taskId,
        scheduledOn: r.ref.scheduledOn,
        status: "done",
        completedAt: now,
        rewardSnapshotCoins: coins,
      });

  await database.batch([
    writeOccurrence,
    database.insert(ledger).values({
      id: crypto.randomUUID(),
      userId,
      amountCoins: coins,
      reason: "task_reward",
      occurrenceId,
      createdAt: now,
    }),
  ]);

  return c.json({
    taskId: r.ref.taskId,
    scheduledOn: r.ref.scheduledOn,
    status: "done",
    completedAt: now,
    rewardSnapshotCoins: coins,
  });
});

/**
 * POST /api/occurrences/uncomplete — re-open a closed day.
 *
 * This is the "correct it afterwards" path, not the undo window: undo inside
 * the window never reaches the server at all (prd/02-tasks.md §Enhancements).
 *
 * Two things constrain the shape. The ledger is append-only by trigger, so the
 * reward is REVERSED with a negative entry rather than deleted — the balance
 * nets to zero and the history stays honest. And the occurrence row is kept
 * (the ledger references it) with its snapshot intact, because nulling the
 * snapshot is exactly what `occurrence_snapshot_write_once` aborts.
 */
occurrenceRoutes.post("/uncomplete", async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);

  const r = await resolveOccurrence(database, userId, await c.req.json().catch(() => null));
  if (!r.ok) return c.json({ error: r.error, issues: r.issues }, r.status);

  const existing = r.loaded.existing;
  if (existing?.status !== "done") return c.json({ error: "not completed" }, 409);

  const coins = existing.rewardSnapshotCoins ?? 0;
  await database.batch([
    database
      .update(occurrence)
      .set({ status: "pending", completedAt: null })
      .where(eq(occurrence.id, existing.id)),
    database.insert(ledger).values({
      id: crypto.randomUUID(),
      userId,
      amountCoins: -coins,
      reason: "task_reward",
      occurrenceId: existing.id,
      createdAt: new Date().toISOString(),
    }),
  ]);

  return c.json({ taskId: r.ref.taskId, scheduledOn: r.ref.scheduledOn, reversedCoins: coins });
});
