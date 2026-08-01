import { env } from "cloudflare:test";
import {
  addDays,
  occurrencesInWindow,
  todayIn,
  WEEKDAYS_MASK_WEEKDAYS,
} from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client";
import app from "../src/index";
import { listGeneratingTasks } from "../src/lib/tasks";

// Exercises the real router against a real D1, through a real session — the same
// path a browser takes. Nothing here stubs the database.

const TS = "2026-07-01T00:00:00Z";

let userId: string;
let token: string;

async function makeUser(): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "America/Sao_Paulo", TS)
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  const tok = await sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
  return { id, token: tok };
}

function req(method: string, path: string, body?: unknown, auth = true): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const call = (method: string, path: string, body?: unknown, auth = true) =>
  app.fetch(req(method, path, body, auth), env);

const ROUTINE = {
  type: "routine" as const,
  title: "Stretch",
  effortMinutes: 15,
  weekdays: WEEKDAYS_MASK_WEEKDAYS,
};

async function createRoutine(overrides: Record<string, unknown> = {}) {
  const res = await call("POST", "/api/tasks", { ...ROUTINE, ...overrides });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; [k: string]: unknown };
}

beforeEach(async () => {
  const u = await makeUser();
  userId = u.id;
  token = u.token;
});

describe("POST /api/tasks", () => {
  it("creates a routine and defaults the reward to the effort", async () => {
    const created = await createRoutine({ effortMinutes: 45 });
    expect(created.type).toBe("routine");
    expect(created.rewardCoins).toBe(45);
    expect(created.weekdays).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(created.dueAt).toBeNull();
    expect(created.deletedAt).toBeNull();
  });

  it("creates a one-off with a due date", async () => {
    const res = await call("POST", "/api/tasks", {
      type: "oneoff",
      title: "Renew passport",
      effortMinutes: 60,
      dueAt: "2026-08-05T09:00:00Z",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dueAt).toBe("2026-08-05T09:00:00Z");
    expect(body.weekdays).toBeNull();
  });

  it("rejects an invalid payload with 400, not 500", async () => {
    const noMask = await call("POST", "/api/tasks", { ...ROUTINE, weekdays: undefined });
    expect(noMask.status).toBe(400);
    const routineWithDue = await call("POST", "/api/tasks", {
      ...ROUTINE,
      dueAt: "2026-08-05T09:00:00Z",
    });
    expect(routineWithDue.status).toBe(400);
    expect((await call("POST", "/api/tasks", null)).status).toBe(400);
  });

  it("rejects an epic that is not yours with 400, not a foreign-key 500", async () => {
    const res = await call("POST", "/api/tasks", { ...ROUTINE, epicId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });

  it("requires a session", async () => {
    expect((await call("POST", "/api/tasks", ROUTINE, false)).status).toBe(401);
    expect((await call("GET", "/api/tasks", undefined, false)).status).toBe(401);
  });
});

describe("POST /api/tasks/quick-add", () => {
  it("captures a one-off with the default effort and no epic", async () => {
    const res = await call("POST", "/api/tasks/quick-add", { title: "Buy milk" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe("oneoff");
    expect(body.effortMinutes).toBe(30);
    expect(body.rewardCoins).toBe(30);
    expect(body.epicId).toBeNull();
    expect(body.dueAt).toBeNull();
  });

  it("rejects an empty title", async () => {
    expect((await call("POST", "/api/tasks/quick-add", { title: "  " })).status).toBe(400);
  });
});

describe("GET /api/tasks", () => {
  it("lists only your own live tasks", async () => {
    await createRoutine({ title: "Mine" });

    const other = await makeUser();
    const saved = token;
    token = other.token;
    await createRoutine({ title: "Theirs" });
    token = saved;

    const res = await call("GET", "/api/tasks");
    const body = (await res.json()) as Array<{ title: string }>;
    expect(body.map((t) => t.title)).toEqual(["Mine"]);
  });

  it("filters by type and epic", async () => {
    await createRoutine();
    await call("POST", "/api/tasks/quick-add", { title: "Buy milk" });

    const routines = (await (await call("GET", "/api/tasks?type=routine")).json()) as unknown[];
    const oneoffs = (await (await call("GET", "/api/tasks?type=oneoff")).json()) as unknown[];
    expect(routines).toHaveLength(1);
    expect(oneoffs).toHaveLength(1);
  });

  it("404s another user's task by id", async () => {
    const mine = await createRoutine();
    const other = await makeUser();
    token = other.token;
    expect((await call("GET", `/api/tasks/${mine.id}`)).status).toBe(404);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("applies a partial update", async () => {
    const created = await createRoutine();
    const res = await call("PATCH", `/api/tasks/${created.id}`, { title: "Stretch more" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.title).toBe("Stretch more");
    expect(body.effortMinutes).toBe(15); // untouched
  });

  it("refuses to change the type — that is fixed at creation", async () => {
    const created = await createRoutine();
    const res = await call("PATCH", `/api/tasks/${created.id}`, { type: "oneoff" });
    expect(res.status).toBe(400);
  });

  it("refuses scheduling fields that do not belong to the task's type", async () => {
    const routine = await createRoutine();
    expect(
      (await call("PATCH", `/api/tasks/${routine.id}`, { dueAt: "2026-08-05T09:00:00Z" })).status,
    ).toBe(400);

    const quick = (await (
      await call("POST", "/api/tasks/quick-add", { title: "Buy milk" })
    ).json()) as { id: string };
    expect(
      (await call("PATCH", `/api/tasks/${quick.id}`, { weekdays: WEEKDAYS_MASK_WEEKDAYS })).status,
    ).toBe(400);
  });

  it("checks the date bounds against the merged row, not just the patch", async () => {
    const created = await createRoutine({ startsOn: "2026-08-01", endsOn: "2026-08-31" });
    // endsOn alone is valid in isolation; against the stored startsOn it is not.
    const res = await call("PATCH", `/api/tasks/${created.id}`, { endsOn: "2026-07-01" });
    expect(res.status).toBe(400);
  });

  it("404s a soft-deleted task", async () => {
    const created = await createRoutine();
    await call("DELETE", `/api/tasks/${created.id}`);
    expect((await call("PATCH", `/api/tasks/${created.id}`, { title: "x" })).status).toBe(404);
  });
});

describe("DELETE — soft, and it stops generation", () => {
  it("keeps the row and sets deleted_at", async () => {
    const created = await createRoutine();
    expect((await call("DELETE", `/api/tasks/${created.id}`)).status).toBe(200);

    const row = await env.DB.prepare("SELECT id, deleted_at FROM task WHERE id = ?")
      .bind(created.id)
      .first<{ id: string; deleted_at: string | null }>();
    expect(row?.id).toBe(created.id); // the row is still there
    expect(row?.deleted_at).toBeTypeOf("string");

    const list = (await (await call("GET", "/api/tasks")).json()) as unknown[];
    expect(list).toHaveLength(0);
    expect(
      ((await (await call("GET", "/api/tasks?includeDeleted=true")).json()) as unknown[]).length,
    ).toBe(1);
  });

  it("stops generating occurrences", async () => {
    const created = await createRoutine();
    const database = db(env);

    const before = await listGeneratingTasks(database, userId);
    expect(before).toHaveLength(1);
    expect(
      occurrencesInWindow(
        { kind: "routine", weekdays: before[0]?.weekdays ?? 0 },
        "2026-08-03",
        "2026-08-07",
      ),
    ).toHaveLength(5); // Mon–Fri

    await call("DELETE", `/api/tasks/${created.id}`);

    const after = await listGeneratingTasks(database, userId);
    expect(after).toHaveLength(0); // nothing left to generate from
  });

  it("leaves past occurrences and the coins they paid untouched", async () => {
    const created = await createRoutine();
    const occurrenceId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins) VALUES (?,?,?,?,?,?)",
    )
      .bind(occurrenceId, created.id, "2026-06-01", "done", TS, 15)
      .run();
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,occurrence_id,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), userId, 15, "task_reward", occurrenceId, TS)
      .run();

    await call("DELETE", `/api/tasks/${created.id}`);

    const occ = await env.DB.prepare(
      "SELECT status, reward_snapshot_coins FROM occurrence WHERE id = ?",
    )
      .bind(occurrenceId)
      .first<{ status: string; reward_snapshot_coins: number }>();
    expect(occ).toEqual({ status: "done", reward_snapshot_coins: 15 });

    const bal = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount_coins),0) AS b FROM ledger WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ b: number }>();
    expect(bal?.b).toBe(15); // the ledger is append-only; deleting a task cannot refund
  });

  it("404s an unknown or already-deleted task", async () => {
    const created = await createRoutine();
    await call("DELETE", `/api/tasks/${created.id}`);
    expect((await call("DELETE", `/api/tasks/${created.id}`)).status).toBe(404);
    expect((await call("DELETE", `/api/tasks/${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("bulk operations", () => {
  it("soft-deletes many at once, and only your own", async () => {
    const a = await createRoutine({ title: "A" });
    const b = await createRoutine({ title: "B" });

    const other = await makeUser();
    const saved = token;
    token = other.token;
    const theirs = await createRoutine({ title: "Theirs" });
    token = saved;

    const res = await call("POST", "/api/tasks/bulk-delete", {
      ids: [a.id, b.id, theirs.id],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 }); // not theirs

    expect(((await (await call("GET", "/api/tasks")).json()) as unknown[]).length).toBe(0);
  });

  it("duplicates definitions with new ids and no occurrences", async () => {
    const created = await createRoutine({ title: "Stretch", startsOn: "2026-08-01" });
    await env.DB.prepare(
      "INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins) VALUES (?,?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), created.id, "2026-06-01", "done", TS, 15)
      .run();

    const res = await call("POST", "/api/tasks/bulk-duplicate", { ids: [created.id] });
    expect(res.status).toBe(201);
    const { created: copies } = (await res.json()) as {
      created: Array<Record<string, unknown>>;
    };

    expect(copies).toHaveLength(1);
    const copy = copies[0];
    if (!copy) throw new Error("expected a copy");
    expect(copy.id).not.toBe(created.id);
    expect(copy.title).toBe("Stretch"); // verbatim, no "(copy)" suffix
    expect(copy.weekdays).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(copy.startsOn).toBe("2026-08-01");
    expect(copy.deletedAt).toBeNull();

    const occ = await env.DB.prepare("SELECT COUNT(*) AS n FROM occurrence WHERE task_id = ?")
      .bind(copy.id as string)
      .first<{ n: number }>();
    expect(occ?.n).toBe(0); // history is not copied
  });

  it("rejects an empty id list", async () => {
    expect((await call("POST", "/api/tasks/bulk-delete", { ids: [] })).status).toBe(400);
  });
});

describe("idempotency", () => {
  it("the same key twice creates one task", async () => {
    const key = crypto.randomUUID();
    const make = () =>
      app.fetch(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": key,
          },
          body: JSON.stringify(ROUTINE),
        }),
        env,
      );

    const r1 = await make();
    const r2 = await make();
    const first = (await r1.json()) as { id?: string };
    const second = (await r2.json()) as { id?: string };

    // Assert the status first: `second.id === first.id` also holds when both
    // are undefined, which is how a 409 from a double-registered middleware
    // hid behind a green-looking assertion.
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(first.id).toBeTypeOf("string");
    expect(second.id).toBe(first.id); // replayed, not re-run
    expect(((await (await call("GET", "/api/tasks")).json()) as unknown[]).length).toBe(1);
  });
});

describe("lastCompletedOn", () => {
  it("is null until the task is closed, then names the day", async () => {
    // Daily, for the same reason as the test below: "today" is the real
    // current date, and the default Mon–Fri mask refuses to be completed on a
    // Saturday. The test used to pass five days a week.
    const created = await createRoutine({ weekdays: 0b1111111 });
    const list = async () =>
      (await (await call("GET", "/api/tasks")).json()) as Array<{
        id: string;
        lastCompletedOn: string | null;
      }>;

    expect((await list())[0]?.lastCompletedOn).toBeNull();

    const today = todayIn("America/Sao_Paulo");
    await call("POST", "/api/occurrences/complete", {
      taskId: created.id,
      scheduledOn: today,
    });

    expect((await list())[0]?.lastCompletedOn).toBe(today);
    const single = (await (await call("GET", `/api/tasks/${created.id}`)).json()) as {
      lastCompletedOn: string | null;
    };
    expect(single.lastCompletedOn).toBe(today);
  });

  it("reports the latest day, not the first", async () => {
    // Daily: these offsets are relative to the real current date, so a weekday
    // mask would refuse whichever of them lands on a weekend.
    const created = await createRoutine({ weekdays: 0b1111111 });
    // A routine is not scheduled before it existed, so a task created a second
    // ago has no earlier days to complete.
    await env.DB.prepare("UPDATE task SET created_at = ? WHERE id = ?")
      .bind("2026-01-01T00:00:00Z", created.id)
      .run();

    const today = todayIn("America/Sao_Paulo");
    for (const day of [addDays(today, -3), addDays(today, -1)]) {
      await call("POST", "/api/occurrences/complete", { taskId: created.id, scheduledOn: day });
    }
    const list = (await (await call("GET", "/api/tasks")).json()) as Array<{
      lastCompletedOn: string | null;
    }>;
    expect(list[0]?.lastCompletedOn).toBe(addDays(today, -1));
  });

  it("goes back to null when the only completion is reversed", async () => {
    const created = await createRoutine();
    const today = todayIn("America/Sao_Paulo");
    await call("POST", "/api/occurrences/complete", { taskId: created.id, scheduledOn: today });
    await call("POST", "/api/occurrences/uncomplete", { taskId: created.id, scheduledOn: today });

    const list = (await (await call("GET", "/api/tasks")).json()) as Array<{
      lastCompletedOn: string | null;
    }>;
    expect(list[0]?.lastCompletedOn).toBeNull();
  });
});
