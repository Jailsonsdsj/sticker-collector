import { createEpicSchema, deleteEpicSchema, updateEpicSchema } from "@sticker-collector/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { epic, task } from "../db/schema";
import { getEpic, listEpics, ownsAlbum } from "../lib/epics";
import { requireRow } from "../lib/tasks";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

export const epicRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

epicRoutes.use("*", requireAuth);
epicRoutes.on(["POST", "PATCH", "DELETE"], "*", idempotency);

const bad = (issues?: unknown) => ({ error: "bad request", issues }) as const;

epicRoutes.post("/", async (c) => {
  const parsed = createEpicSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);
  const input = parsed.data;

  if (input.coinGoalAlbumId && !(await ownsAlbum(database, userId, input.coinGoalAlbumId))) {
    return c.json({ error: "unknown album" }, 400);
  }

  const created = requireRow(
    await database
      .insert(epic)
      .values({
        id: crypto.randomUUID(),
        userId,
        title: input.title,
        accent: input.accent,
        coinGoalAlbumId: input.coinGoalAlbumId ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: epic.id }),
    "epic",
  );

  const epicWithProgress = await getEpic(database, userId, created.id);
  return c.json(epicWithProgress, 201);
});

epicRoutes.get("/", async (c) => c.json(await listEpics(db(c.env), c.get("userId"))));

epicRoutes.get("/:id", async (c) => {
  const found = await getEpic(db(c.env), c.get("userId"), c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);
  return c.json(found);
});

epicRoutes.patch("/:id", async (c) => {
  const parsed = updateEpicSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);
  const id = c.req.param("id");
  const data = parsed.data;

  if (data.coinGoalAlbumId && !(await ownsAlbum(database, userId, data.coinGoalAlbumId))) {
    return c.json({ error: "unknown album" }, 400);
  }

  const patch: Record<string, unknown> = {};
  for (const field of ["title", "accent", "coinGoalAlbumId"] as const) {
    if (field in data && data[field] !== undefined) patch[field] = data[field];
  }

  const updated = await database
    .update(epic)
    .set(patch)
    .where(and(eq(epic.id, id), eq(epic.userId, userId)))
    .returning({ id: epic.id });
  if (updated.length === 0) return c.json({ error: "not found" }, 404);

  return c.json(await getEpic(database, userId, id));
});

/**
 * DELETE /api/epics/:id?mode=cascade|unlink
 *
 * The mode is a query parameter, not a body: some clients and proxies drop
 * bodies on DELETE, and this is the one request where a silently-lost parameter
 * would pick the destructive branch. There is no default — the spec says the
 * user must be asked (prd/03-epics.md).
 *
 * Both modes null `epic_id` first. They have to: tasks are SOFT-deleted so
 * their occurrences and the coins they paid survive (T-03), and a soft-deleted
 * row still holds its foreign key to the epic. Cascade differs only in also
 * setting `deleted_at`. Hard-deleting the tasks would orphan `occurrence.task_id`
 * and destroy paid history.
 *
 * One `db.batch([...])` — D1 has no interactive transactions (§4.2).
 */
epicRoutes.delete("/:id", async (c) => {
  const parsed = deleteEpicSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(bad(parsed.error.issues), 400);

  const userId = c.get("userId");
  const database = db(c.env);
  const id = c.req.param("id");

  const owned = await database
    .select({ id: epic.id })
    .from(epic)
    .where(and(eq(epic.id, id), eq(epic.userId, userId)))
    .limit(1);
  if (owned.length === 0) return c.json({ error: "not found" }, 404);

  const detach =
    parsed.data.mode === "cascade"
      ? { epicId: null, deletedAt: new Date().toISOString() }
      : { epicId: null };

  await database.batch([
    database
      .update(task)
      .set(detach)
      .where(and(eq(task.epicId, id), eq(task.userId, userId))),
    database.delete(epic).where(and(eq(epic.id, id), eq(epic.userId, userId))),
  ]);

  return c.json({ deleted: id, mode: parsed.data.mode });
});
