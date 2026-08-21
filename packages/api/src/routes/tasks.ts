import {
  bulkTaskIdsSchema,
  createTaskSchema,
  quickAddTaskSchema,
  updateTaskSchema,
} from "@sticker-collector/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { routineSlot, task } from "../db/schema";
import {
  buildTaskPatch,
  liveTasks,
  newTaskRow,
  ownsEpic,
  type PatchField,
  quickAddRow,
  requireRow,
  selectTasksWithCompletion,
  slotRows,
  slotsFor,
  type TaskInsert,
  toTask,
} from "../lib/tasks";
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

  const created = requireRow(await database.insert(task).values(row).returning(), "task");
  // One batch, because D1 has no interactive transactions. A slot row that
  // failed on its own would leave a routine whose agenda silently disagrees
  // with the form that created it.
  if (slots.length > 0) {
    await database.batch([database.insert(routineSlot).values(slotRows(created.id, slots))]);
  }

  return c.json(toTask(created, null, slots), 201);
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

  const slots = (await slotsFor(database, [id])).get(id) ?? [];
  return c.json(toTask(updated, null, slots));
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
