import { Hono } from "hono";
import { requireAuth } from "./middleware/require-auth";
import { albumRoutes } from "./routes/albums";
import { authRoutes } from "./routes/auth";
import { epicRoutes } from "./routes/epics";
import { imageRoutes } from "./routes/images";
import { occurrenceRoutes } from "./routes/occurrences";
import { taskRoutes } from "./routes/tasks";
import { walletRoutes } from "./routes/wallet";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);

app.route("/api/tasks", taskRoutes);
app.route("/api/occurrences", occurrenceRoutes);
app.route("/api/epics", epicRoutes);
app.route("/api/wallet", walletRoutes);
app.route("/api/images", imageRoutes);
app.route("/api/albums", albumRoutes);

// A protected route: reachable only with a valid session (cookie or bearer).
app.get("/api/me", requireAuth, (c) => c.json({ userId: c.get("userId") }));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
