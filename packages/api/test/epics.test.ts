import { env } from "cloudflare:test";
import { todayIn } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

const DAILY = 0b1111111;

let token: string;
let userId: string;
let today: string;

async function makeUser(): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", "2026-07-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  return {
    id,
    token: await sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256"),
  };
}

function call(method: string, path: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${token}`;
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

type EpicBody = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  accent: string;
  coinGoalAlbumId: string | null;
  oneOffTotal: number;
  oneOffDone: number;
};

async function createEpic(body: Record<string, unknown> = {}): Promise<EpicBody> {
  const res = await call("POST", "/api/epics", { title: "Sticker App", ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as EpicBody;
}

async function createTask(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await call("POST", "/api/tasks", { title: "T", effortMinutes: 15, ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

const quickAdd = async (title: string) =>
  (await (await call("POST", "/api/tasks/quick-add", { title })).json()) as { id: string };

const complete = (taskId: string, scheduledOn: string) =>
  call("POST", "/api/occurrences/complete", { taskId, scheduledOn });

const getEpic = async (id: string) =>
  (await (await call("GET", `/api/epics/${id}`)).json()) as EpicBody;

async function taskRow(id: string) {
  return env.DB.prepare("SELECT id, epic_id, deleted_at FROM task WHERE id = ?")
    .bind(id)
    .first<{ id: string; epic_id: string | null; deleted_at: string | null }>();
}

beforeEach(async () => {
  const u = await makeUser();
  userId = u.id;
  token = u.token;
  today = todayIn("UTC");
});

describe("progress excludes routines", () => {
  it("counts one-offs only, on both sides of the ratio", async () => {
    const ep = await createEpic();
    await createTask({ type: "routine", weekdays: DAILY, epicId: ep.id });
    await createTask({ type: "routine", weekdays: DAILY, epicId: ep.id });
    const oneOff = await createTask({ type: "oneoff", epicId: ep.id });

    // Two routines and one one-off: the denominator is 1, not 3.
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 0 });

    // Completing a routine must not move the ratio at all.
    expect(
      (
        await complete(
          (
            await createTask({ type: "routine", weekdays: DAILY, epicId: ep.id })
          ).id,
          today,
        )
      ).status,
    ).toBe(200);
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 0 });

    expect((await complete(oneOff.id, today)).status).toBe(200);
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 1 });
  });

  it("counts an undated one-off from quick-add once it is ticked", async () => {
    const ep = await createEpic();
    const quick = await quickAdd("Buy milk");
    await call("PATCH", `/api/tasks/${quick.id}`, { epicId: ep.id });

    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 0 });
    expect((await complete(quick.id, today)).status).toBe(200);
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 1 });
  });

  it("drops a soft-deleted task out of both sides", async () => {
    const ep = await createEpic();
    const a = await createTask({ type: "oneoff", epicId: ep.id });
    await createTask({ type: "oneoff", epicId: ep.id });
    await complete(a.id, today);
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 2, oneOffDone: 1 });

    await call("DELETE", `/api/tasks/${a.id}`);
    expect(await getEpic(ep.id)).toMatchObject({ oneOffTotal: 1, oneOffDone: 0 });
  });

  it("moves back down when a task is re-opened", async () => {
    const ep = await createEpic();
    const t = await createTask({ type: "oneoff", epicId: ep.id });
    await complete(t.id, today);
    expect((await getEpic(ep.id)).oneOffDone).toBe(1);

    await call("POST", "/api/occurrences/uncomplete", { taskId: t.id, scheduledOn: today });
    expect((await getEpic(ep.id)).oneOffDone).toBe(0);
  });

  it("is 0/0 for an empty epic and lists every epic", async () => {
    const a = await createEpic({ title: "A" });
    await createEpic({ title: "B" });
    expect(a).toMatchObject({ oneOffTotal: 0, oneOffDone: 0 });

    const list = (await (await call("GET", "/api/epics")).json()) as EpicBody[];
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.title).sort()).toEqual(["A", "B"]);
  });
});

describe("delete with choice", () => {
  it("cascade soft-deletes the tasks and keeps their paid history", async () => {
    const ep = await createEpic();
    const t = await createTask({ type: "oneoff", epicId: ep.id });
    await complete(t.id, today);

    const res = await call("DELETE", `/api/epics/${ep.id}?mode=cascade`);
    expect(res.status).toBe(200);

    const row = await taskRow(t.id);
    expect(row?.id).toBe(t.id); // the row survives — soft delete, not DELETE
    expect(row?.deleted_at).toBeTypeOf("string");
    expect(row?.epic_id).toBeNull();

    // The occurrence and the coins it paid are untouched.
    const occ = await env.DB.prepare(
      "SELECT status, reward_snapshot_coins FROM occurrence WHERE task_id = ?",
    )
      .bind(t.id)
      .first<{ status: string; reward_snapshot_coins: number }>();
    expect(occ).toEqual({ status: "done", reward_snapshot_coins: 15 });

    const bal = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount_coins),0) AS b FROM ledger WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ b: number }>();
    expect(bal?.b).toBe(15);

    expect((await call("GET", `/api/epics/${ep.id}`)).status).toBe(404);
  });

  it("unlink leaves the tasks live and unlinked", async () => {
    const ep = await createEpic();
    const t = await createTask({ type: "oneoff", epicId: ep.id });

    expect((await call("DELETE", `/api/epics/${ep.id}?mode=unlink`)).status).toBe(200);

    const row = await taskRow(t.id);
    expect(row?.deleted_at).toBeNull(); // still live
    expect(row?.epic_id).toBeNull(); // but no longer in an epic

    const tasks = (await (await call("GET", "/api/tasks")).json()) as unknown[];
    expect(tasks).toHaveLength(1);
    expect((await call("GET", `/api/epics/${ep.id}`)).status).toBe(404);
  });

  it("refuses to guess the mode", async () => {
    const ep = await createEpic();
    expect((await call("DELETE", `/api/epics/${ep.id}`)).status).toBe(400);
    expect((await call("DELETE", `/api/epics/${ep.id}?mode=delete`)).status).toBe(400);
    expect((await call("DELETE", `/api/epics/${ep.id}?mode=`)).status).toBe(400);

    expect((await call("GET", `/api/epics/${ep.id}`)).status).toBe(200); // still there
  });

  it("404s an unknown epic and never touches another user's tasks", async () => {
    expect((await call("DELETE", `/api/epics/${crypto.randomUUID()}?mode=unlink`)).status).toBe(
      404,
    );

    const theirs = await createEpic();
    const theirTask = await createTask({ type: "oneoff", epicId: theirs.id });

    const mine = token;
    token = (await makeUser()).token;
    expect((await call("DELETE", `/api/epics/${theirs.id}?mode=cascade`)).status).toBe(404);
    token = mine;

    const row = await taskRow(theirTask.id);
    expect(row?.deleted_at).toBeNull();
    expect(row?.epic_id).toBe(theirs.id);
  });
});

describe("CRUD", () => {
  it("defaults the accent to a token name", async () => {
    expect((await createEpic()).accent).toBe("epic-1");
    expect((await createEpic({ accent: "epic-4" })).accent).toBe("epic-4");
  });

  it("refuses a literal colour as an accent", async () => {
    expect((await call("POST", "/api/epics", { title: "X", accent: "#c65cff" })).status).toBe(400);
  });

  it("refuses an unknown coin-goal album with 400, not a foreign-key 500", async () => {
    const res = await call("POST", "/api/epics", {
      title: "X",
      coinGoalAlbumId: crypto.randomUUID(),
    });
    expect(res.status).toBe(400);
  });

  it("applies a partial update and rejects an empty one", async () => {
    const ep = await createEpic();
    const res = await call("PATCH", `/api/epics/${ep.id}`, { title: "Renamed" });
    expect(res.status).toBe(200);
    expect((await res.json()) as EpicBody).toMatchObject({ title: "Renamed", accent: "epic-1" });

    expect((await call("PATCH", `/api/epics/${ep.id}`, {})).status).toBe(400);
  });

  it("404s another user's epic on read and update", async () => {
    const ep = await createEpic();
    token = (await makeUser()).token;
    expect((await call("GET", `/api/epics/${ep.id}`)).status).toBe(404);
    expect((await call("PATCH", `/api/epics/${ep.id}`, { title: "x" })).status).toBe(404);
    expect(((await (await call("GET", "/api/epics")).json()) as unknown[]).length).toBe(0);
  });

  it("requires a session", async () => {
    expect((await call("GET", "/api/epics", undefined, false)).status).toBe(401);
    expect((await call("POST", "/api/epics", { title: "X" }, false)).status).toBe(401);
  });
});

describe("the section an epic lives in", () => {
  it("defaults to active, so every epic that already exists stays put", async () => {
    // The migration defaults the column too; this is the other half of the same
    // promise, for epics created after it.
    expect((await createEpic()).status).toBe("active");
  });

  it("is set at creation", async () => {
    expect((await createEpic({ status: "next" })).status).toBe("next");
    expect((await createEpic({ status: "achieved" })).status).toBe("achieved");
  });

  it("refuses a section that is not one of the three", async () => {
    expect((await call("POST", "/api/epics", { title: "X", status: "someday" })).status).toBe(400);
  });

  it("moves between sections on a patch", async () => {
    const ep = await createEpic();

    const res = await call("PATCH", `/api/epics/${ep.id}`, { status: "achieved" });

    expect(res.status).toBe(200);
    expect((await res.json()) as EpicBody).toMatchObject({ status: "achieved" });
  });
});

describe("the description actually reaches the database", () => {
  it("is stored on create", async () => {
    // It was accepted by the schema, returned by the read, and never written:
    // the insert simply did not list it, so every description typed into the
    // form was dropped on the floor.
    const created = await createEpic({ description: "Everything for the sticker app." });

    expect(created.description).toBe("Everything for the sticker app.");
    const read = (await (await call("GET", `/api/epics/${created.id}`)).json()) as EpicBody;
    expect(read.description).toBe("Everything for the sticker app.");
  });

  it("is stored on update, and can be cleared", async () => {
    const ep = await createEpic({ description: "First words." });

    await call("PATCH", `/api/epics/${ep.id}`, { description: "Second words." });
    expect(
      ((await (await call("GET", `/api/epics/${ep.id}`)).json()) as EpicBody).description,
    ).toBe("Second words.");

    await call("PATCH", `/api/epics/${ep.id}`, { description: null });
    expect(
      ((await (await call("GET", `/api/epics/${ep.id}`)).json()) as EpicBody).description,
    ).toBeNull();
  });
});

describe("idempotency", () => {
  it("the same key twice creates one epic", async () => {
    const key = crypto.randomUUID();
    const make = () =>
      app.fetch(
        new Request("http://localhost/api/epics", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": key,
          },
          body: JSON.stringify({ title: "Once" }),
        }),
        env,
      );

    const r1 = await make();
    const r2 = await make();
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual(await r1.json());
    expect(((await (await call("GET", "/api/epics")).json()) as unknown[]).length).toBe(1);
  });
});
