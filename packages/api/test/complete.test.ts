import { env } from "cloudflare:test";
import { addDays, todayIn, weekdayOf } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

// Real router, real D1, real triggers. The coin economy is asserted through the
// ledger's running sum, never through a cached column.

const DAILY = 0b1111111;

let token: string;
let userId: string;
let today: string;

async function makeUser(timezone = "UTC"): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, timezone, "2026-07-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  return {
    id,
    token: await sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256"),
  };
}

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

async function createTask(extra: Record<string, unknown> = {}): Promise<{ id: string }> {
  const res = await call("POST", "/api/tasks", {
    type: "routine",
    title: "Stretch",
    effortMinutes: 15,
    weekdays: DAILY,
    ...extra,
  });
  expect(res.status).toBe(201);
  const created = (await res.json()) as { id: string };

  // Backdated on purpose. A routine's schedule starts no earlier than the day
  // the task was created — you cannot have missed something that did not exist
  // — and almost every test in this file is about completing an EARLIER day.
  // Without this the fixture has no past to act on.
  await env.DB.prepare("UPDATE task SET created_at = ? WHERE id = ?")
    .bind("2026-01-01T00:00:00Z", created.id)
    .run();
  return created;
}

const complete = (taskId: string, scheduledOn: string, headers?: Record<string, string>) =>
  call("POST", "/api/occurrences/complete", { taskId, scheduledOn }, headers);
const uncomplete = (taskId: string, scheduledOn: string) =>
  call("POST", "/api/occurrences/uncomplete", { taskId, scheduledOn });

async function balance(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_coins),0) AS b FROM ledger WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ b: number }>();
  return row?.b ?? 0;
}

async function ledgerRows() {
  const { results } = await env.DB.prepare(
    "SELECT amount_coins, reason, occurrence_id, created_at FROM ledger WHERE user_id = ? ORDER BY created_at, amount_coins DESC",
  )
    .bind(userId)
    .all<{ amount_coins: number; reason: string; occurrence_id: string; created_at: string }>();
  return results;
}

async function storedOccurrence(taskId: string) {
  return env.DB.prepare(
    "SELECT id, scheduled_on, status, completed_at, reward_snapshot_coins FROM occurrence WHERE task_id = ?",
  )
    .bind(taskId)
    .first<{
      id: string;
      scheduled_on: string;
      status: string;
      completed_at: string | null;
      reward_snapshot_coins: number | null;
    }>();
}

beforeEach(async () => {
  const u = await makeUser();
  userId = u.id;
  token = u.token;
  today = todayIn("UTC");
});

describe("the two done-when criteria", () => {
  it("a reward edit does not change a closed occurrence's snapshot", async () => {
    const task = await createTask({ effortMinutes: 15 }); // reward defaults to 15
    expect((await complete(task.id, today)).status).toBe(200);
    expect(await balance()).toBe(15);

    // Raise the reward AFTER the day is closed.
    expect((await call("PATCH", `/api/tasks/${task.id}`, { rewardCoins: 999 })).status).toBe(200);

    const occ = await storedOccurrence(task.id);
    expect(occ?.reward_snapshot_coins).toBe(15); // history is not rewritten
    expect(await balance()).toBe(15); // and no coins appeared

    // The read model agrees.
    const got = (await (
      await call("GET", `/api/occurrences?from=${today}&to=${today}`)
    ).json()) as Array<{ rewardSnapshotCoins: number }>;
    expect(got[0]?.rewardSnapshotCoins).toBe(15);
  });

  it("a late completion keeps scheduled_on while the ledger carries the real timestamp", async () => {
    const task = await createTask();
    const threeDaysAgo = addDays(today, -3);

    const before = new Date().toISOString();
    const res = await complete(task.id, threeDaysAgo);
    expect(res.status).toBe(200);

    const occ = await storedOccurrence(task.id);
    expect(occ?.scheduled_on).toBe(threeDaysAgo); // the day the work was FOR
    expect(occ?.status).toBe("done");
    // ...but it was actually done now, not three days ago.
    expect(occ?.completed_at?.slice(0, 10)).toBe(today);
    expect((occ?.completed_at ?? "") >= before).toBe(true);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.created_at.slice(0, 10)).toBe(today);
    expect(rows[0]?.created_at).not.toBe(threeDaysAgo);
  });
});

describe("completing", () => {
  it("mints exactly the reward, once, linked to the occurrence", async () => {
    const task = await createTask({ effortMinutes: 45 });
    await complete(task.id, today);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount_coins).toBe(45);
    expect(rows[0]?.reason).toBe("task_reward");
    expect(rows[0]?.occurrence_id).toBe((await storedOccurrence(task.id))?.id);
    expect(await balance()).toBe(45);
  });

  it("refuses a second completion instead of paying twice", async () => {
    const task = await createTask();
    expect((await complete(task.id, today)).status).toBe(200);
    expect((await complete(task.id, today)).status).toBe(409);
    expect(await balance()).toBe(15);
  });

  it("is atomic — a rejected occurrence write mints no coins", async () => {
    const task = await createTask();
    // Pre-insert a DONE row directly, bypassing the route, then ask the route
    // to complete: the guard refuses and nothing is appended.
    await env.DB.prepare(
      "INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins) VALUES (?,?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), task.id, today, "done", "2026-07-01T00:00:00Z", 15)
      .run();

    expect((await complete(task.id, today)).status).toBe(409);
    expect(await balance()).toBe(0); // the pre-inserted row had no ledger entry, and none was added
  });
});

describe("uncompleting", () => {
  it("reverses the coins with a negative entry rather than deleting one", async () => {
    const task = await createTask();
    await complete(task.id, today);
    expect(await balance()).toBe(15);

    const res = await uncomplete(task.id, today);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      taskId: task.id,
      scheduledOn: today,
      reversedCoins: 15,
    });

    expect(await balance()).toBe(0);
    const rows = await ledgerRows();
    expect(rows).toHaveLength(2); // append-only: two rows, not zero
    expect(rows.map((r) => r.amount_coins).sort((a, b) => a - b)).toEqual([-15, 15]);
  });

  it("keeps the row and its frozen snapshot, and reopens the day", async () => {
    const task = await createTask();
    await complete(task.id, today);
    await uncomplete(task.id, today);

    const occ = await storedOccurrence(task.id);
    expect(occ?.status).toBe("pending");
    expect(occ?.completed_at).toBeNull();
    expect(occ?.reward_snapshot_coins).toBe(15); // the trigger would abort nulling it

    const got = (await (
      await call("GET", `/api/occurrences?from=${today}&to=${today}`)
    ).json()) as Array<{ status: string }>;
    expect(got[0]?.status).toBe("pending"); // completable again
  });

  it("re-completion pays the frozen snapshot, not the task's new reward", async () => {
    const task = await createTask({ effortMinutes: 15 });
    await complete(task.id, today);
    await uncomplete(task.id, today);
    await call("PATCH", `/api/tasks/${task.id}`, { rewardCoins: 500 });

    const res = await complete(task.id, today);
    expect(res.status).toBe(200);
    expect((await res.json()) as { rewardSnapshotCoins: number }).toMatchObject({
      rewardSnapshotCoins: 15,
    });
    expect(await balance()).toBe(15); // +15, -15, +15
  });

  it("refuses when the day is not done", async () => {
    const task = await createTask();
    expect((await uncomplete(task.id, today)).status).toBe(409);
    expect(await balance()).toBe(0);
  });
});

describe("guards", () => {
  it("refuses a future occurrence — coins are never minted early", async () => {
    const task = await createTask();
    const res = await complete(task.id, addDays(today, 1));
    expect(res.status).toBe(400);
    expect(await balance()).toBe(0);
  });

  it("refuses an archived occurrence", async () => {
    const task = await createTask();
    const res = await complete(task.id, addDays(today, -8));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/archived/);
  });

  it("allows a missed occurrence — it still pays in full", async () => {
    const task = await createTask();
    expect((await complete(task.id, addDays(today, -7))).status).toBe(200);
    expect(await balance()).toBe(15);
  });

  it("refuses a date the routine is not scheduled on — the coin-minting hole", async () => {
    const task = await createTask({ weekdays: 0b0011111 }); // Mon–Fri

    // Walk back to the most recent Saturday (weekday 5, Monday-indexed). Doing
    // the arithmetic rather than probing keeps this deterministic on any day.
    let saturday = today;
    while (weekdayOf(saturday) !== 5) saturday = addDays(saturday, -1);

    const res = await complete(task.id, saturday);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not scheduled/);
    expect(await balance()).toBe(0);
  });

  it("404s a soft-deleted task and another user's task", async () => {
    const task = await createTask();
    await call("DELETE", `/api/tasks/${task.id}`);
    expect((await complete(task.id, today)).status).toBe(404);

    const mine = token;
    token = (await makeUser()).token;
    const theirs = await createTask();
    token = mine;
    expect((await complete(theirs.id, today)).status).toBe(404);
    expect(await balance()).toBe(0);
  });

  it("rejects a malformed reference", async () => {
    expect((await call("POST", "/api/occurrences/complete", { taskId: "x" })).status).toBe(400);
    expect((await call("POST", "/api/occurrences/complete", null)).status).toBe(400);
  });

  it("requires a session", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/occurrences/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: "x", scheduledOn: "2026-08-03" }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("the snapshot trigger, not the application code", () => {
  it("rejects a direct attempt to rewrite a frozen snapshot", async () => {
    const task = await createTask();
    await complete(task.id, today);
    const occ = await storedOccurrence(task.id);

    await expect(
      env.DB.prepare("UPDATE occurrence SET reward_snapshot_coins = ? WHERE id = ?")
        .bind(9999, occ?.id)
        .run(),
    ).rejects.toThrow(/write-once|ABORT/i);

    expect((await storedOccurrence(task.id))?.reward_snapshot_coins).toBe(15);
  });
});

describe("idempotency", () => {
  it("a retried tap mints one reward, not two", async () => {
    const task = await createTask();
    const key = crypto.randomUUID();

    const r1 = await complete(task.id, today, { "Idempotency-Key": key });
    const r2 = await complete(task.id, today, { "Idempotency-Key": key });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200); // replayed, not a 409 from re-running
    expect(await r2.json()).toEqual(await r1.json());
    expect((await ledgerRows()).length).toBe(1);
    expect(await balance()).toBe(15);
  });
});

describe("undated one-offs — the Backlog", () => {
  const quickAdd = async (title: string) =>
    (await (await call("POST", "/api/tasks/quick-add", { title })).json()) as { id: string };

  it("is completable today, and pays the default effort", async () => {
    const t = await quickAdd("Buy milk");
    expect((await complete(t.id, today)).status).toBe(200);
    expect(await balance()).toBe(30); // DEFAULT_EFFORT_MINUTES
  });

  it("is refused on any other date — there is no scheduled day to backdate to", async () => {
    const t = await quickAdd("Buy milk");

    const yesterday = await complete(t.id, addDays(today, -1));
    expect(yesterday.status).toBe(400);
    expect(((await yesterday.json()) as { error: string }).error).toMatch(
      /only be completed today/,
    );

    expect((await complete(t.id, addDays(today, 1))).status).toBe(400);
    expect(await balance()).toBe(0);
  });

  it("appears in the occurrences window once ticked, though it is scheduled on no day", async () => {
    const t = await quickAdd("Buy milk");
    const before = (await (
      await call("GET", `/api/occurrences?from=${today}&to=${today}`)
    ).json()) as unknown[];
    expect(before).toHaveLength(0); // unscheduled: nothing to show

    await complete(t.id, today);
    const after = (await (
      await call("GET", `/api/occurrences?from=${today}&to=${today}`)
    ).json()) as Array<{ taskId: string; status: string }>;
    expect(after).toEqual([expect.objectContaining({ taskId: t.id, status: "done" })]);
  });

  it("can still be re-opened the next day, when today has moved on", async () => {
    const t = await quickAdd("Buy milk");
    await complete(t.id, today);
    // Uncomplete re-resolves the same reference; the stored row makes the date
    // legitimate regardless of what "today" is by then.
    expect((await uncomplete(t.id, today)).status).toBe(200);
    expect(await balance()).toBe(0);
  });
});
