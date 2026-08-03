import { isKnownTimeZone, updateMeSchema } from "@sticker-collector/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "./db/client";
import { user } from "./db/schema";
import { requireAuth } from "./middleware/require-auth";
import { albumListRoutes } from "./routes/albumList";
import { albumRoutes } from "./routes/albums";
import { authRoutes } from "./routes/auth";
import { backupRoutes } from "./routes/backup";
import { epicRoutes } from "./routes/epics";
import { imageRoutes } from "./routes/images";
import { occurrenceRoutes } from "./routes/occurrences";
import { pullRoutes, stickerRoutes } from "./routes/pulls";
import { purchaseRoutes } from "./routes/purchases";
import { reportRoutes } from "./routes/reports";
import { taskRoutes } from "./routes/tasks";
import { walletRoutes } from "./routes/wallet";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);

app.route("/api/tasks", taskRoutes);
app.route("/api/occurrences", occurrenceRoutes);
app.route("/api/epics", epicRoutes);
app.route("/api/wallet", walletRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/backup", backupRoutes);
app.route("/api/images", imageRoutes);
app.route("/api/albums", albumRoutes);
// Same prefix, separate router: albums.ts owns creation, purchases.ts owns spending.
app.route("/api/albums", purchaseRoutes);
app.route("/api/albums", pullRoutes);
app.route("/api/albums", albumListRoutes);
app.route("/api/stickers", stickerRoutes);

/**
 * The signed-in user's own settings.
 *
 * The timezone is here because the client needs it: every local day — what
 * "today" is, which occurrences exist — is resolved from `user.timezone` on
 * this side, and a client resolving it from the *device* instead disagrees for
 * the hours the two zones differ. That disagreement is not cosmetic: an undated
 * one-off may only be completed today, so a client an hour ahead of the profile
 * gets a 400 on every tick until midnight catches up.
 */
app.get("/api/me", requireAuth, async (c) => {
  const row = await db(c.env)
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, c.get("userId")))
    .get();
  return c.json({ userId: c.get("userId"), timezone: row?.timezone ?? "UTC" });
});

/** The only setting there is. A wrong zone moves every day boundary, so it is
 *  worth being able to correct without a re-provision. */
app.patch("/api/me", requireAuth, async (c) => {
  const parsed = updateMeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
  if (!isKnownTimeZone(parsed.data.timezone)) return c.json({ error: "unknown timezone" }, 400);

  await db(c.env)
    .update(user)
    .set({ timezone: parsed.data.timezone })
    .where(eq(user.id, c.get("userId")));

  return c.json({ userId: c.get("userId"), timezone: parsed.data.timezone });
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
