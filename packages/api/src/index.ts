import { Hono } from "hono";
import { requireAuth } from "./middleware/require-auth";
import { authRoutes } from "./routes/auth";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);

// A protected route: reachable only with a valid session (cookie or bearer).
app.get("/api/me", requireAuth, (c) => c.json({ userId: c.get("userId") }));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
