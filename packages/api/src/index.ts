import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
