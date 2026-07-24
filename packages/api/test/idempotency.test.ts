import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { idempotency } from "../src/middleware/idempotency";

// Exercises the middleware against a real route + real D1. The handler appends a
// ledger row and returns a fresh random token each time it runs, so a replayed
// response (same token) proves the handler did NOT run again.

const TS = "2026-07-01T00:00:00Z";

async function freshUser(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", TS)
    .run();
  return id;
}

async function ledgerCount(userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.post("/mutate/:userId", idempotency, async (c) => {
    const userId = c.req.param("userId");
    const token = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), userId, 10, "task_reward", TS)
      .run();
    return c.json({ token });
  });
  return app;
}

function post(userId: string, key?: string): Request {
  const headers: Record<string, string> = {};
  if (key) headers["Idempotency-Key"] = key;
  return new Request(`http://localhost/mutate/${userId}`, { method: "POST", headers });
}

describe("idempotency middleware", () => {
  it("same key twice → handler runs once, one ledger row, identical response", async () => {
    const u = await freshUser();
    const app = makeApp();
    const key = crypto.randomUUID();

    const r1 = await app.fetch(post(u, key), env);
    const b1 = await r1.json();
    const r2 = await app.fetch(post(u, key), env);
    const b2 = await r2.json();

    expect(r2.status).toBe(r1.status);
    expect(b2).toEqual(b1); // same token → the second call replayed, did not re-run
    expect(await ledgerCount(u)).toBe(1); // exactly one row minted
  });

  it("different keys → the handler runs for each", async () => {
    const u = await freshUser();
    const app = makeApp();

    const r1 = await app.fetch(post(u, crypto.randomUUID()), env);
    const r2 = await app.fetch(post(u, crypto.randomUUID()), env);
    const t1 = (await r1.json()) as { token: string };
    const t2 = (await r2.json()) as { token: string };

    expect(t1.token).not.toBe(t2.token);
    expect(await ledgerCount(u)).toBe(2);
  });

  it("no Idempotency-Key → passes through and runs normally", async () => {
    const u = await freshUser();
    const app = makeApp();

    const r = await app.fetch(post(u), env);
    expect(r.status).toBe(200);
    expect(await ledgerCount(u)).toBe(1);
  });

  it("replays the exact status and body bytes", async () => {
    const u = await freshUser();
    const app = makeApp();
    const key = crypto.randomUUID();

    const r1 = await app.fetch(post(u, key), env);
    const text1 = await r1.text();
    const r2 = await app.fetch(post(u, key), env);
    const text2 = await r2.text();

    expect(text2).toBe(text1);
    expect(r2.headers.get("content-type")).toBe(r1.headers.get("content-type"));
  });
});
