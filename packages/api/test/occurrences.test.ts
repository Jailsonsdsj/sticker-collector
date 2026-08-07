import { env } from "cloudflare:test";
import {
  addDays,
  maskFromDays,
  occurrencesInWindow,
  todayIn,
  WEEKDAYS_MASK_ALL,
  WEEKDAYS_MASK_WEEKDAYS,
  type Weekday,
} from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { scheduleOf } from "../src/lib/occurrences";

// Real router, real D1, real session. The zero-writes claim is checked by
// counting rows before and after — not by trusting the handler.

const TS = "2026-07-01T00:00:00Z";
const SAT = 5 as Weekday;

let token: string;
let today: string;

async function makeUser(timezone = "UTC"): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, timezone, TS)
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  const tok = await sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
  return { id, token: tok };
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

type Occ = {
  taskId: string;
  scheduledOn: string;
  status: string;
  completedAt: string | null;
  rewardSnapshotCoins: number | null;
};

async function fetchWindow(from: string, to: string): Promise<Occ[]> {
  const res = await call("GET", `/api/occurrences?from=${from}&to=${to}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Occ[];
}

async function createTask(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await call("POST", "/api/tasks", body);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

/**
 * Creates the task as though it had existed for a while.
 *
 * A routine's schedule starts no earlier than the day it was created — you
 * cannot have missed something that did not exist — so any test about a *past*
 * day needs a task that was actually around then. Without this the window is
 * simply empty, which is correct behaviour and a useless fixture.
 */
async function createOldTask(body: Record<string, unknown>, daysAgo = 60) {
  const task = await createTask(body);
  await env.DB.prepare("UPDATE task SET created_at = ? WHERE id = ?")
    .bind(`${addDays(today, -daysAgo)}T00:00:00Z`, task.id)
    .run();
  return task;
}

const monFri = (extra: Record<string, unknown> = {}) => ({
  type: "routine",
  title: "Stretch",
  effortMinutes: 15,
  weekdays: WEEKDAYS_MASK_WEEKDAYS,
  ...extra,
});

async function countRows(table: "occurrence" | "ledger"): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

async function storeOccurrence(
  taskId: string,
  scheduledOn: string,
  status: string,
  coins: number | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins) VALUES (?,?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), taskId, scheduledOn, status, status === "done" ? TS : null, coins)
    .run();
}

beforeEach(async () => {
  token = (await makeUser()).token;
  today = todayIn("UTC");
});

describe("zero writes — the whole point of lazy materialisation", () => {
  it("querying next month writes nothing", async () => {
    await createTask(monFri());

    const before = await countRows("occurrence");
    expect(before).toBe(0);

    const from = addDays(today, 30);
    const results = await fetchWindow(from, addDays(from, 30));

    expect(results.length).toBeGreaterThan(15); // a month of Mon–Fri
    expect(await countRows("occurrence")).toBe(0); // and not one row written
    expect(await countRows("ledger")).toBe(0); // nor a coin minted
  });

  it("writes nothing for a window spanning past, today and future", async () => {
    await createTask(monFri());
    await createTask({ type: "oneoff", title: "Passport", effortMinutes: 60, dueAt: TS });

    const before = await countRows("occurrence");
    await fetchWindow(addDays(today, -60), addDays(today, 60));
    expect(await countRows("occurrence")).toBe(before);
  });

  it("writes nothing even when stored rows already exist", async () => {
    const task = await createTask(monFri({ weekdays: 0b1111111 }));
    await storeOccurrence(task.id, addDays(today, -3), "done", 15);

    expect(await countRows("occurrence")).toBe(1);
    await fetchWindow(addDays(today, -30), addDays(today, 30));
    expect(await countRows("occurrence")).toBe(1); // unchanged, not one more
  });
});

describe("generation", () => {
  // These fixtures name **fixed August dates**, so the task has to have existed
  // then: a routine's schedule starts no earlier than the day it was created.
  // Creating them "now" made the whole block pass only until the real calendar
  // moved past those dates — which it did, on 2026-08-06.
  it("produces a Mon–Fri routine and skips weekends", async () => {
    await createOldTask(monFri());
    // 2026-08-03 is a Monday.
    const got = await fetchWindow("2026-08-03", "2026-08-09");
    expect(got.map((o) => o.scheduledOn)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("produces a Sat-only routine", async () => {
    await createOldTask(monFri({ weekdays: maskFromDays([SAT]) }));
    const got = await fetchWindow("2026-08-03", "2026-08-16");
    expect(got.map((o) => o.scheduledOn)).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("clips to startsOn and endsOn", async () => {
    await createOldTask(monFri({ startsOn: "2026-08-05", endsOn: "2026-08-06" }));
    const got = await fetchWindow("2026-08-03", "2026-08-14");
    expect(got.map((o) => o.scheduledOn)).toEqual(["2026-08-05", "2026-08-06"]);
  });

  it("emits a dated one-off once and an undated one never", async () => {
    await createTask({
      type: "oneoff",
      title: "Passport",
      effortMinutes: 60,
      dueAt: "2026-08-05T12:00:00Z",
    });
    await call("POST", "/api/tasks/quick-add", { title: "Buy milk" });

    const got = await fetchWindow("2026-08-01", "2026-08-31");
    expect(got).toHaveLength(1);
    expect(got[0]?.scheduledOn).toBe("2026-08-05");
  });

  it("returns results sorted by date", async () => {
    await createOldTask(monFri());
    const got = await fetchWindow("2026-08-03", "2026-08-21");
    const dates = got.map((o) => o.scheduledOn);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("the join with stored rows", () => {
  it("lets a stored done row win, with its snapshot and timestamp", async () => {
    // Daily, not Mon–Fri: these offsets are relative to the real current date,
    // so a weekday mask would make the assertion depend on what day it is.
    const task = await createTask(monFri({ weekdays: 0b1111111 }));
    const when = addDays(today, -2);
    await storeOccurrence(task.id, when, "done", 15);

    const got = await fetchWindow(addDays(today, -7), today);
    const hit = got.find((o) => o.scheduledOn === when);
    expect(hit?.status).toBe("done");
    expect(hit?.rewardSnapshotCoins).toBe(15);
    expect(hit?.completedAt).toBe(TS);

    // Every other day in the window is derived, with no snapshot.
    const others = got.filter((o) => o.scheduledOn !== when);
    expect(others.every((o) => o.rewardSnapshotCoins === null)).toBe(true);
  });

  it("derives everything when no rows exist at all", async () => {
    await createTask(monFri({ weekdays: 0b1111111 }));
    const got = await fetchWindow(addDays(today, -7), addDays(today, 7));
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((o) => o.completedAt === null)).toBe(true);
  });
});

describe("a routine does not exist before it was created", () => {
  it("skips the earlier days of the week it was added in", () => {
    // The reported bug, at the exact shape it was reported: a Mon–Sun routine
    // added on a THURSDAY showed Monday, Tuesday and Wednesday of that same
    // week as missed — three failures against a task that did not exist yet.
    //
    // Asserted against scheduleOf rather than the route because the weekday has
    // to be fixed: "today" comes from the clock, and this scenario is only
    // reproducible on a Thursday.
    const thursday = "2026-08-06"; // a Thursday
    const task = {
      type: "routine",
      weekdays: WEEKDAYS_MASK_ALL,
      startsOn: null,
      endsOn: null,
      dueAt: null,
      createdAt: `${thursday}T09:00:00Z`,
    } as unknown as Parameters<typeof scheduleOf>[0];

    const week = occurrencesInWindow(scheduleOf(task, "UTC"), "2026-08-03", "2026-08-09");

    // Monday the 3rd through Wednesday the 5th are simply not scheduled.
    expect(week).toEqual(["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]);
  });

  it("generates nothing before its creation day", async () => {
    await createTask(monFri({ weekdays: 0b1111111 })); // every day

    const got = await fetchWindow(addDays(today, -7), today);

    expect(got.map((o) => o.scheduledOn)).toEqual([today]);
  });

  it("still starts today, so the day you add it counts", async () => {
    await createTask(monFri({ weekdays: 0b1111111 }));

    const got = await fetchWindow(addDays(today, -7), addDays(today, 2));

    expect(got.find((o) => o.scheduledOn === today)?.status).toBe("pending");
    expect(got.some((o) => o.status === "missed")).toBe(false);
  });

  it("honours a startsOn in the future — that is a real intention", async () => {
    const later = addDays(today, 3);
    await createTask(monFri({ weekdays: 0b1111111, startsOn: later }));

    const got = await fetchWindow(addDays(today, -7), addDays(today, 7));

    expect(got.every((o) => o.scheduledOn >= later)).toBe(true);
  });

  it("clamps a startsOn in the past — backdating cannot invent failures", async () => {
    await createTask(monFri({ weekdays: 0b1111111, startsOn: addDays(today, -30) }));

    const got = await fetchWindow(addDays(today, -7), today);

    expect(got.map((o) => o.scheduledOn)).toEqual([today]);
  });

  it("keeps a stored row from before creation, so history is never dropped", async () => {
    // Seeded and restored history predates the row's created_at. The window is
    // scheduled days UNION days that actually have a row, and this is why.
    const task = await createTask(monFri({ weekdays: 0b1111111 }));
    const earlier = addDays(today, -3);
    await env.DB.prepare(
      `INSERT INTO occurrence (id, task_id, scheduled_on, status, completed_at, reward_snapshot_coins)
       VALUES (?, ?, ?, 'done', ?, 15)`,
    )
      .bind(crypto.randomUUID(), task.id, earlier, `${earlier}T12:00:00Z`)
      .run();

    const got = await fetchWindow(addDays(today, -7), today);

    expect(got.find((o) => o.scheduledOn === earlier)?.status).toBe("done");
  });
});

describe("status derivation, end to end", () => {
  it("is pending today and in the future, missed at day 1 and 7", async () => {
    await createOldTask(monFri({ weekdays: 0b1111111 })); // daily, so every offset lands
    const got = await fetchWindow(addDays(today, -8), addDays(today, 2));
    const at = (offset: number) =>
      got.find((o) => o.scheduledOn === addDays(today, offset))?.status;

    expect(at(0)).toBe("pending");
    expect(at(1)).toBe("pending");
    expect(at(-1)).toBe("missed");
    expect(at(-7)).toBe("missed");
    expect(at(-8)).toBe("archived"); // routines archive on day 8
  });

  it("never archives a dated one-off", async () => {
    const dueOn = addDays(today, -30);
    await createTask({
      type: "oneoff",
      title: "Passport",
      effortMinutes: 60,
      dueAt: `${dueOn}T12:00:00Z`,
    });
    const got = await fetchWindow(addDays(today, -40), today);
    expect(got).toHaveLength(1);
    expect(got[0]?.status).toBe("missed");
  });
});

describe("timezone", () => {
  it("resolves a one-off's due instant to the user's civil date", async () => {
    // 02:00Z on the 5th is still the 4th in São Paulo (UTC-3).
    const sp = await makeUser("America/Sao_Paulo");
    token = sp.token;
    await createTask({
      type: "oneoff",
      title: "Passport",
      effortMinutes: 60,
      dueAt: "2026-08-05T02:00:00Z",
    });

    const got = await fetchWindow("2026-08-01", "2026-08-31");
    expect(got[0]?.scheduledOn).toBe("2026-08-04");
  });

  it("derives today from the user's timezone, not the server's", async () => {
    // Kiritimati is UTC+14, Niue is UTC-11 — 25 hours apart, so at any instant
    // AT LEAST ONE of them is on a different civil date from UTC. (Kiritimati
    // matches UTC only before 10:00Z; Niue only from 11:00Z. Never both.)
    //
    // So a handler that resolved "today" from UTC instead of the user would get
    // one of these two wrong, whatever time this test runs.
    for (const zone of ["Pacific/Kiritimati", "Pacific/Niue"]) {
      const u = await makeUser(zone);
      token = u.token;
      // Old enough that yesterday is inside the routine's schedule — a task
      // created today has no yesterday to be missed on.
      await createOldTask(monFri({ weekdays: 0b1111111 }));

      const theirToday = todayIn(zone);
      const yesterday = addDays(theirToday, -1);
      const got = await fetchWindow(yesterday, theirToday);
      const statusOn = (d: string) => got.find((o) => o.scheduledOn === d)?.status;

      expect(statusOn(theirToday)).toBe("pending");
      expect(statusOn(yesterday)).toBe("missed");
    }

    // And the two really are on different days from each other.
    expect(todayIn("Pacific/Kiritimati")).not.toBe(todayIn("Pacific/Niue"));
  });
});

describe("scoping and guards", () => {
  it("never returns another user's occurrences", async () => {
    await createTask(monFri());
    const other = await makeUser();
    token = other.token;
    expect(await fetchWindow("2026-08-03", "2026-08-09")).toEqual([]);
  });

  it("generates nothing for a soft-deleted routine", async () => {
    const task = await createOldTask(monFri());
    expect((await fetchWindow("2026-08-03", "2026-08-09")).length).toBe(5);

    await call("DELETE", `/api/tasks/${task.id}`);
    expect(await fetchWindow("2026-08-03", "2026-08-09")).toEqual([]);
  });

  it("requires a session", async () => {
    const res = await call(
      "GET",
      "/api/occurrences?from=2026-08-01&to=2026-08-02",
      undefined,
      false,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a bad window", async () => {
    expect((await call("GET", "/api/occurrences")).status).toBe(400);
    expect((await call("GET", "/api/occurrences?from=2026-08-10&to=2026-08-01")).status).toBe(400);
    expect((await call("GET", "/api/occurrences?from=2026-02-30&to=2026-03-01")).status).toBe(400);
  });

  it("rejects a window wider than a year, which the CPU budget cannot afford", async () => {
    const res = await call("GET", "/api/occurrences?from=2020-01-01&to=2030-01-01");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/366 days/);
  });

  it("accepts exactly the maximum window", async () => {
    const res = await call(
      "GET",
      `/api/occurrences?from=2026-01-01&to=${addDays("2026-01-01", 365)}`,
    );
    expect(res.status).toBe(200);
  });
});
