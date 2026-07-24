import { createMiddleware } from "hono/factory";

// Idempotency for mutating endpoints (architecture.md §4.4). The client sends an
// `Idempotency-Key`; a retry of the same key replays the first response instead of
// re-running the handler — so a flaky "complete" tap never mints coins twice, and
// the offline outbox can safely replay a queued mutation.
//
// Claim-first ordering is the whole point: INSERT OR IGNORE reserves the key before
// the handler runs, so two concurrent requests with the same key cannot both execute.
export const idempotency = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const key = c.req.header("Idempotency-Key");
  if (!key) {
    await next();
    return;
  }

  // Reserve the key. Empty response_json marks the request as still in flight.
  const claim = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO mutation (key, response_json, created_at) VALUES (?, '', ?)",
  )
    .bind(key, new Date().toISOString())
    .run();

  if (claim.meta.changes === 0) {
    // Key already seen: replay the stored response, or 409 if the first one is
    // still running (concurrent duplicate).
    const row = await c.env.DB.prepare("SELECT response_json FROM mutation WHERE key = ?")
      .bind(key)
      .first<{ response_json: string }>();
    if (!row || row.response_json === "") {
      return c.json({ error: "idempotent request in progress" }, 409);
    }
    const stored = JSON.parse(row.response_json) as {
      status: number;
      contentType: string;
      body: string;
    };
    return new Response(stored.body, {
      status: stored.status,
      headers: { "content-type": stored.contentType },
    });
  }

  // We own the key. Run the handler; on failure, release the claim so a retry can
  // proceed rather than being locked out forever.
  try {
    await next();
  } catch (err) {
    await c.env.DB.prepare("DELETE FROM mutation WHERE key = ? AND response_json = ''")
      .bind(key)
      .run();
    throw err;
  }

  // Persist the exact response bytes so replays are byte-identical.
  const body = await c.res.clone().text();
  const stored = {
    status: c.res.status,
    contentType: c.res.headers.get("content-type") ?? "application/json",
    body,
  };
  await c.env.DB.prepare("UPDATE mutation SET response_json = ? WHERE key = ?")
    .bind(JSON.stringify(stored), key)
    .run();
});
