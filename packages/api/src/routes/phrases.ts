import { createPhraseSchema, type Phrase } from "@sticker-collector/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { motivationalPhrase } from "../db/schema";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

/**
 * The home screen's rotating motivational phrases.
 *
 * Oldest first: the client picks the phrase on show from the wall clock and
 * the list's position, so a stable order is what keeps every device showing
 * the same line at the same time.
 */
export const phraseRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

phraseRoutes.use("*", requireAuth);
phraseRoutes.on(["POST", "DELETE"], "*", idempotency);

const columns = {
  id: motivationalPhrase.id,
  text: motivationalPhrase.text,
  createdAt: motivationalPhrase.createdAt,
};

phraseRoutes.get("/", async (c) => {
  const rows: Phrase[] = await db(c.env)
    .select(columns)
    .from(motivationalPhrase)
    .where(eq(motivationalPhrase.userId, c.get("userId")))
    .orderBy(asc(motivationalPhrase.createdAt), asc(motivationalPhrase.id));
  return c.json(rows);
});

phraseRoutes.post("/", async (c) => {
  const parsed = createPhraseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "bad request", issues: parsed.error.issues }, 400);

  const created: Phrase = {
    id: crypto.randomUUID(),
    text: parsed.data.text,
    createdAt: new Date().toISOString(),
  };
  await db(c.env)
    .insert(motivationalPhrase)
    .values({ ...created, userId: c.get("userId") });
  return c.json(created, 201);
});

phraseRoutes.delete("/:id", async (c) => {
  const deleted = await db(c.env)
    .delete(motivationalPhrase)
    .where(
      and(
        eq(motivationalPhrase.id, c.req.param("id")),
        eq(motivationalPhrase.userId, c.get("userId")),
      ),
    )
    .returning({ id: motivationalPhrase.id });
  if (deleted.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ deleted: 1 });
});
