import { env } from "cloudflare:test";
import {
  addDays,
  maskFromDays,
  weekStart as mondayOf,
  todayIn,
  type WeekReport,
} from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * The weekly report endpoint.
 *
 * The grid's rules are proven in `shared/weekReport.test.ts`; what is checked
 * here is that it is refused before Sunday 22:00, built from the right rows,
 * and frozen once built.
 *
 * Weeks are chosen relative to the real calendar, never by weekday: the past
 * week is always two weeks back (always ready), and the future week is next
 * week (never ready). A test that picked "this week" would pass or fail
 * depending on whether it ran on a Sunday night.
 */

let token: string;
let userId: string;

const PAST = addDays(mondayOf(todayIn("UTC")), -14);
const NEXT = addDays(mondayOf(todayIn("UTC")), 7);

beforeEach(async () => {
  userId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(userId, "h", "s", 600000, "UTC", "2026-01-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  token = await sign({ sub: userId, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
});

const get = (weekStart: string) =>
  app.fetch(
    new Request(`http://localhost/api/reports/week/${weekStart}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

const report = async (weekStart: string) => {
  const response = await get(weekStart);
  expect(response.status).toBe(200);
  return (await response.json()) as WeekReport;
};

async function addTask(title: string, type: "routine" | "oneoff", weekdays: number | null) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
     VALUES (?,?,?,30,30,'medium',?,?,?)`,
  )
    .bind(id, userId, title, type, weekdays, "2026-01-01T00:00:00Z")
    .run();
  return id;
}

async function tick(taskId: string, scheduledOn: string, doneOn: string) {
  await env.DB.prepare(
    `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
     VALUES (?,?,?,'done',?,30)`,
  )
    .bind(crypto.randomUUID(), taskId, scheduledOn, `${doneOn}T09:00:00Z`)
    .run();
}

describe("when it can be read", () => {
  it("is refused until the week's Sunday 22:00", async () => {
    expect((await get(NEXT)).status).toBe(409);
  });

  it("wants a Monday", async () => {
    expect((await get(addDays(PAST, 2))).status).toBe(400);
  });
});

describe("what it holds", () => {
  it("grids the routines and lists the one-offs below", async () => {
    const gym = await addTask("Gym", "routine", maskFromDays([0, 2]));
    const call = await addTask("Call the bank", "oneoff", null);
    await tick(gym, PAST, PAST);
    await tick(call, addDays(PAST, -20), addDays(PAST, 3));

    const body = await report(PAST);

    expect(body.routines).toEqual([
      expect.objectContaining({
        title: "Gym",
        cells: ["done", "off", "missed", "off", "off", "off", "off"],
      }),
    ]);
    expect(body.others).toEqual([
      expect.objectContaining({ title: "Call the bank", doneOn: addDays(PAST, 3), coins: 30 }),
    ]);
  });
});

describe("once it is made", () => {
  it("is frozen — a later edit to the routine does not reach it", async () => {
    const gym = await addTask("Gym", "routine", maskFromDays([0]));
    const first = await report(PAST);

    await env.DB.prepare("UPDATE task SET title = 'Renamed', weekdays = 127 WHERE id = ?")
      .bind(gym)
      .run();
    await tick(gym, PAST, PAST);

    expect(await report(PAST)).toEqual(first);
  });

  it("is stored once", async () => {
    await addTask("Gym", "routine", maskFromDays([0]));
    await report(PAST);
    await report(PAST);

    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM week_report WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("cannot be rewritten (week_report_no_update/no_delete)", async () => {
    await report(PAST);

    await expect(
      env.DB.prepare("UPDATE week_report SET body = '{}' WHERE user_id = ?").bind(userId).run(),
    ).rejects.toThrow(/week_report is append-only/);
    await expect(
      env.DB.prepare("DELETE FROM week_report WHERE user_id = ?").bind(userId).run(),
    ).rejects.toThrow(/week_report is append-only/);
  });

  it("never serves another user's report", async () => {
    await addTask("Mine", "routine", maskFromDays([0]));
    const mine = await report(PAST);
    expect(mine.routines).toHaveLength(1);

    userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(userId, "h", "s", 600000, "UTC", "2026-01-01T00:00:00Z")
      .run();
    const { sign } = await import("hono/jwt");
    const iat = Math.floor(Date.now() / 1000);
    token = await sign({ sub: userId, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");

    expect((await report(PAST)).routines).toEqual([]);
  });
});
