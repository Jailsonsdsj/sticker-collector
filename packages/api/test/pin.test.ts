import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * Pinning a task to a day.
 *
 * The rule that shapes all of this: `validateDate` lets a fresh completion
 * through only on a day the schedule actually yields, and an undated one-off is
 * its single exception. So a pin is only meaningful where a completion is —
 * otherwise the pin puts a row in today's list that this same API refuses to
 * tick, and the user is left holding a task they cannot finish.
 */
const TODAY = "2026-08-05";

let token: string;

async function makeUser(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", "2026-07-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  return sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
}

const call = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );

const create = (body: unknown) => call("POST", "/api/tasks", body);
const patch = (id: string, body: unknown) => call("PATCH", `/api/tasks/${id}`, body);

const rowOf = (id: string) =>
  env.DB.prepare("SELECT type, due_at, pinned_on FROM task WHERE id = ?").bind(id).first<{
    type: string;
    due_at: string | null;
    pinned_on: string | null;
  }>();

beforeEach(async () => {
  token = await makeUser();
});

describe("an undated one-off", () => {
  it("can be pinned at creation", async () => {
    const response = await create({
      title: "Buy milk",
      type: "oneoff",
      effortMinutes: 15,
      pinnedOn: TODAY,
    });
    expect(response.status).toBe(201);

    const created = (await response.json()) as { id: string; pinnedOn: string | null };
    expect(created.pinnedOn).toBe(TODAY);
    expect((await rowOf(created.id))?.pinned_on).toBe(TODAY);
  });

  it("can be pinned and unpinned afterwards", async () => {
    const created = (await (
      await create({ title: "Buy milk", type: "oneoff", effortMinutes: 15 })
    ).json()) as { id: string };

    expect((await patch(created.id, { pinnedOn: TODAY })).status).toBe(200);
    expect((await rowOf(created.id))?.pinned_on).toBe(TODAY);

    // null, not absent — absent means "leave it alone".
    expect((await patch(created.id, { pinnedOn: null })).status).toBe(200);
    expect((await rowOf(created.id))?.pinned_on).toBeNull();
  });
});

describe("everything else", () => {
  it("refuses to pin a routine", async () => {
    // A routine is completable only on a day its mask covers, so a pin would
    // promise a tick the API then rejects.
    const created = (await (
      await create({ title: "Stretch", type: "routine", effortMinutes: 15, weekdays: 0b0000001 })
    ).json()) as { id: string };

    const response = await patch(created.id, { pinnedOn: TODAY });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/undated/i) });
    expect((await rowOf(created.id))?.pinned_on).toBeNull();
  });

  it("refuses to pin a dated one-off", async () => {
    const created = (await (
      await create({
        title: "Passport",
        type: "oneoff",
        effortMinutes: 30,
        dueAt: "2026-08-20T09:00:00Z",
      })
    ).json()) as { id: string };

    expect((await patch(created.id, { pinnedOn: TODAY })).status).toBe(400);
  });

  it("refuses a pin and a due date sent together", async () => {
    const created = (await (
      await create({ title: "Buy milk", type: "oneoff", effortMinutes: 15 })
    ).json()) as { id: string };

    const response = await patch(created.id, {
      pinnedOn: TODAY,
      dueAt: "2026-08-20T09:00:00Z",
    });
    expect(response.status).toBe(400);
  });

  it("drops a pin sent when creating a dated one-off", async () => {
    // The schema allows the field; the row builder is what keeps the column
    // honest, so a pin that cannot mean anything is simply not stored.
    const created = (await (
      await create({
        title: "Passport",
        type: "oneoff",
        effortMinutes: 30,
        dueAt: "2026-08-20T09:00:00Z",
        pinnedOn: TODAY,
      })
    ).json()) as { id: string };

    expect((await rowOf(created.id))?.pinned_on).toBeNull();
  });
});
