import {
  bulkTaskIdsSchema,
  createTaskSchema,
  describeConflicts,
  findSlotConflicts,
  quickAddTaskSchema,
  type RoutineSlot,
  type SlotConflict,
  todayIn,
  toggleSubtaskSchema,
  updateTaskSchema,
} from "@sticker-collector/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { routineSlot, subtask, task } from "../db/schema";
import {
  buildTaskPatch,
  liveTasks,
  newSubtaskRows,
  newTaskRow,
  otherRoutineSlots,
  ownsEpic,
  type PatchField,
  quickAddRow,
  requireRow,
  selectTasksWithCompletion,
  slotRows,
  slotsFor,
  subtasksFor,
  type TaskInsert,
  toTask,
} from "../lib/tasks";
import { timeZoneOf } from "../lib/user";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

export const taskRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Registered on the sub-app, once. Registering on the parent for both
// "/api/tasks" and "/api/tasks/*" makes Hono match BOTH for a request to the
// collection, running idempotency twice — the second pass sees its own claim
// and 409s the request it just made.
taskRoutes.use("*", requireAuth);
// Only mutations claim a key, so a GET carrying a stray one never reserves it.
taskRoutes.on(["POST", "PATCH", "DELETE"], "*", idempotency);

const bad = (issues?: unknown) => ({ error: "bad request", issues }) as const;

/**
 * Whether a proposed set of slots lands on top of another routine's.
 *
 * **409, not 400.** Nothing is malformed — the same body would be accepted an
 * hour later once the other routine moved. The state of the collection is what
 * refuses it.
 *
 * Enforced here and not only in the form: the form is one way in, and a rule
 * that lives in a screen is a rule the API does not have. The agenda puts two
 * slots in one cell on top of each other, so a saved clash is a task that
 * silently vanishes from the day it was scheduled on.
 */
async function slotClash(
  database: ReturnType<typeof db>,
  userId: string,
  slots: readonly RoutineSlot[],
  exceptTaskId?: string,
): Promise<{ error: string; conflicts: SlotConflict[] } | null> {
  if (slots.length === 0) return null;

  const others = await otherRoutineSlots(database, userId, exceptTaskId);
  const conflicts = findSlotConflicts(slots, others, exceptTaskId);
  const error = describeConflicts(conflicts);
  return error ? { error, conflicts } : null;
}

taskRoutes.post("/", async (c) => {
  const parsed = createTaskSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);

  if (parsed.data.epicId && !(await ownsEpic(database, userId, parsed.data.epicId))) {
    return c.json({ error: "unknown epic" }, 400);
  }

  const row = newTaskRow(userId, parsed.data);
  const slots = parsed.data.type === "routine" ? (parsed.data.slots ?? []) : [];

  const clash = await slotClash(database, userId, slots);
  if (clash) return c.json({ error: clash.error, conflicts: clash.conflicts }, 409);

  const created = requireRow(await database.insert(task).values(row).returning(), "task");
  const steps = newSubtaskRows(created.id, parsed.data.subtasks ?? []);

  // One batch, because D1 has no interactive transactions. A slot row that
  // failed on its own would leave a routine whose agenda silently disagrees
  // with the form that created it — and the same is true of a checklist that
  // arrived half-written.
  const writes = [];
  if (slots.length > 0)
    writes.push(database.insert(routineSlot).values(slotRows(created.id, slots)));
  if (steps.length > 0) writes.push(database.insert(subtask).values(steps));
  if (writes.length > 0) await database.batch(writes as [(typeof writes)[number]]);

  return c.json(toTask(created, null, slots, steps), 201);
});

/** Capture must never cost a form: one field, an undated one-off, no epic. */
taskRoutes.post("/quick-add", async (c) => {
  const parsed = quickAddTaskSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const row = quickAddRow(c.get("userId"), parsed.data.title);
  const created = requireRow(await db(c.env).insert(task).values(row).returning(), "task");
  return c.json(toTask(created), 201);
});

taskRoutes.get("/", async (c) => {
  const { epicId, type, includeDeleted } = c.req.query();

  const filters = [eq(task.userId, c.get("userId"))];
  if (includeDeleted !== "true") filters.push(isNull(task.deletedAt));
  if (epicId) filters.push(eq(task.epicId, epicId));
  if (type === "routine" || type === "oneoff") filters.push(eq(task.type, type));

  return c.json(await selectTasksWithCompletion(db(c.env), and(...filters)));
});

taskRoutes.get("/:id", async (c) => {
  const rows = await selectTasksWithCompletion(
    db(c.env),
    and(eq(task.id, c.req.param("id")), eq(task.userId, c.get("userId"))),
  );
  const row = rows[0];
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

taskRoutes.patch("/:id", async (c) => {
  const parsed = updateTaskSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);
  const id = c.req.param("id");

  const existing = await database
    .select()
    .from(task)
    .where(and(eq(task.id, id), eq(task.userId, userId), isNull(task.deletedAt)))
    .limit(1);
  const current = existing[0];
  if (!current) return c.json({ error: "not found" }, 404);

  const built = buildTaskPatch(current, parsed.data as Partial<Record<PatchField, unknown>>);
  if ("error" in built) return c.json({ error: built.error }, 400);

  if (built.patch.epicId && !(await ownsEpic(database, userId, built.patch.epicId as string))) {
    return c.json({ error: "unknown epic" }, 400);
  }

  // Before the UPDATE, not after: a 409 must leave the task exactly as it was,
  // and D1 has no transaction to roll one back with.
  if (parsed.data.slots) {
    const clash = await slotClash(database, userId, parsed.data.slots, id);
    if (clash) return c.json({ error: clash.error, conflicts: clash.conflicts }, 409);
  }

  // A slots-only patch touches no column on `task`, and Drizzle throws "No
  // values to set" on an empty UPDATE. Nothing to change is not an error — the
  // slots below are the change.
  const updated =
    Object.keys(built.patch).length === 0
      ? current
      : requireRow(
          await database
            .update(task)
            .set(built.patch)
            .where(and(eq(task.id, id), eq(task.userId, userId)))
            .returning(),
          "task",
        );

  // `slots` replaces the whole set — partial editing of one weekday would need
  // a second endpoint to say which one. Delete-then-insert in ONE batch: two
  // requests could leave a routine with no slots at all if the second failed.
  if (parsed.data.slots) {
    const rows = slotRows(id, parsed.data.slots);
    await database.batch([
      database.delete(routineSlot).where(eq(routineSlot.taskId, id)),
      ...(rows.length > 0 ? [database.insert(routineSlot).values(rows)] : []),
    ]);
  }

  // Same shape as `slots`, and the same reason: replacing the whole list is
  // the only edit a checklist needs, and delete-then-insert in ONE batch keeps
  // a failure from leaving a task with no steps at all.
  //
  // Ticks are NOT carried over. An edit rewrites the list, and matching an old
  // tick onto a new title would be guessing which step the author meant.
  if (parsed.data.subtasks) {
    const rows = newSubtaskRows(id, parsed.data.subtasks);
    await database.batch([
      database.delete(subtask).where(eq(subtask.taskId, id)),
      ...(rows.length > 0 ? [database.insert(subtask).values(rows)] : []),
    ]);
  }

  const slots = (await slotsFor(database, [id])).get(id) ?? [];
  const steps = (await subtasksFor(database, [id])).get(id) ?? [];
  return c.json(toTask(updated, null, slots, steps));
});

/**
 * Ticking one step.
 *
 * Its own endpoint rather than a field on the task patch: the patch replaces
 * the whole list, and a tick must not be able to rewrite the titles around it.
 *
 * **The day is the server's**, resolved from `user.timezone` — the same source
 * every other local day comes from. A client sending its own date could tick a
 * routine's step for a day that is not today, which is the one thing `done_on`
 * being a date is supposed to prevent.
 */
taskRoutes.patch("/:taskId/subtasks/:subtaskId", async (c) => {
  const parsed = toggleSubtaskSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);
  const taskId = c.req.param("taskId");

  // Joined to `task` so a step can only be ticked by whoever owns the task it
  // belongs to — `subtask` carries no user id of its own.
  const owned = await database
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.userId, userId), isNull(task.deletedAt)))
    .limit(1);
  if (owned.length === 0) return c.json({ error: "not found" }, 404);

  const timeZone = await timeZoneOf(database, userId);
  if (!timeZone) return c.json({ error: "not found" }, 404);

  const doneOn = parsed.data.done ? todayIn(timeZone) : null;
  const updated = await database
    .update(subtask)
    .set({ doneOn })
    .where(and(eq(subtask.id, c.req.param("subtaskId")), eq(subtask.taskId, taskId)))
    .returning();
  if (updated.length === 0) return c.json({ error: "not found" }, 404);

  const steps = (await subtasksFor(database, [taskId])).get(taskId) ?? [];
  return c.json({ subtasks: [...steps].sort((a, b) => a.position - b.position) });
});

/**
 * Soft delete. The row survives with `deleted_at` set, which drops it out of
 * `liveTasks` and therefore out of generation — while its past occurrences and
 * the coins they paid stay exactly where they are.
 */
taskRoutes.delete("/:id", async (c) => {
  const deleted = await db(c.env)
    .update(task)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(task.id, c.req.param("id")), liveTasks(c.get("userId"))))
    .returning({ id: task.id });
  if (deleted.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ deleted: deleted.length });
});

taskRoutes.post("/bulk-delete", async (c) => {
  const parsed = bulkTaskIdsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const deleted = await db(c.env)
    .update(task)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(inArray(task.id, parsed.data.ids), liveTasks(c.get("userId"))))
    .returning({ id: task.id });
  return c.json({ deleted: deleted.length });
});

/** Copies definitions only. Occurrences are history — a copy has none. */
taskRoutes.post("/bulk-duplicate", async (c) => {
  const parsed = bulkTaskIdsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const database = db(c.env);
  const sources = await database
    .select()
    .from(task)
    .where(and(inArray(task.id, parsed.data.ids), liveTasks(c.get("userId"))));
  if (sources.length === 0) return c.json({ created: [] });

  const now = new Date().toISOString();
  const copies: TaskInsert[] = sources.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    createdAt: now,
    deletedAt: null,
  }));

  const created = await database.insert(task).values(copies).returning();
  // A copy has no history, so `lastCompletedOn` is null by construction.
  return c.json({ created: created.map((row) => toTask(row)) }, 201);
});
