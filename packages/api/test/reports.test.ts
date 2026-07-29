import { env } from "cloudflare:test";
import type { EffortReport, MomentumReport } from "@sticker-collector/shared";
import { addDays, todayIn, WEEKDAYS_MASK_ALL } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * The momentum endpoint.
 *
 * The arithmetic is proven in `shared/reports.test.ts`; what is checked here is
 * that the right rows reach it — the user's own tasks, only real completions,
 * and the user's own calendar day.
 */

let token: string;
let userId: string;

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

function switchTo(user: { id: string; token: string }) {
  token = user.token;
  userId = user.id;
}

/** A daily routine, straight into the table. */
async function routine(title: string, weekdays = WEEKDAYS_MASK_ALL): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
     VALUES (?,?,?,?,?,'medium','routine',?,?)`,
  )
    .bind(id, userId, title, 30, 30, weekdays, "2026-07-01T00:00:00Z")
    .run();
  return id;
}

async function complete(taskId: string, day: string, status = "done") {
  await env.DB.prepare(
    `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
     VALUES (?,?,?,?,?,?)`,
  )
    .bind(crypto.randomUUID(), taskId, day, status, `${day}T09:00:00Z`, 30)
    .run();
}

const momentum = async () => {
  const response = await app.fetch(
    new Request("http://localhost/api/reports/momentum", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as MomentumReport;
};

const today = () => todayIn("UTC");

beforeEach(async () => {
  switchTo(await makeUser());
});

describe("what the endpoint reports", () => {
  it("gives a streak for a routine completed on consecutive days", async () => {
    const id = await routine("Stretch");
    await complete(id, addDays(today(), -2));
    await complete(id, addDays(today(), -1));

    const report = await momentum();
    const streak = report.streaks.find((s) => s.taskId === id);
    expect(streak).toMatchObject({ title: "Stretch", current: 2 });
  });

  it("counts a perfect day when everything scheduled was done", async () => {
    const a = await routine("A");
    const b = await routine("B");
    const yesterday = addDays(today(), -1);
    await complete(a, yesterday);
    await complete(b, yesterday);

    const report = await momentum();
    expect(report.perfect.count).toBeGreaterThanOrEqual(1);
  });

  it("carries the three trailing windows and the seven weekdays", async () => {
    await routine("Stretch");
    const report = await momentum();

    expect(report.rates.map((rate) => rate.days)).toEqual([7, 30, 90]);
    expect(report.weekdays.map((slot) => slot.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("carries a per-day series for the heatmap", async () => {
    // The same tally the rates and the perfect-day count come from, so the
    // three cannot disagree about what a day contained.
    const id = await routine("Stretch");
    const yesterday = addDays(today(), -1);
    await complete(id, yesterday);

    const report = await momentum();

    expect(report.days.length).toBe(366);
    expect(report.days.at(-1)?.date).toBe(today());
    expect(report.days.find((day) => day.date === yesterday)).toEqual({
      date: yesterday,
      scheduled: 1,
      done: 1,
    });

    // And it agrees with the trailing rate over the same window.
    const week = report.rates[0] as { done: number };
    const lastSeven = report.days.slice(-7).reduce((sum, day) => sum + day.done, 0);
    expect(lastSeven).toBe(week.done);
  });

  it("uses the user's own calendar day", async () => {
    const report = await momentum();
    expect(report.today).toBe(today());
  });
});

describe("which rows count", () => {
  it("ignores a stored row that is not a completion", async () => {
    // `missed` and `archived` rows exist; neither is a completion, and
    // `pending` is never authoritative when stored.
    const id = await routine("Stretch");
    await complete(id, addDays(today(), -1), "missed");
    await complete(id, addDays(today(), -2), "archived");

    const report = await momentum();
    expect(report.streaks.find((s) => s.taskId === id)?.current).toBe(0);
    expect(report.rates[0]?.done).toBe(0);
  });

  it("ignores a deleted task entirely", async () => {
    // A deleted routine generates nothing, so it contributes no scheduled days
    // and cannot drag the completion rate down.
    const id = await routine("Gone");
    await complete(id, addDays(today(), -1));
    await env.DB.prepare("UPDATE task SET deleted_at = ? WHERE id = ?")
      .bind("2026-07-28T00:00:00Z", id)
      .run();

    const report = await momentum();
    expect(report.streaks.some((s) => s.taskId === id)).toBe(false);
    expect(report.rates[0]?.scheduled).toBe(0);
  });

  it("never reports another user's work", async () => {
    const stranger = await makeUser();
    switchTo(stranger);
    const theirs = await routine("Theirs");
    await complete(theirs, addDays(today(), -1));

    switchTo(await makeUser());
    const report = await momentum();

    expect(report.streaks).toEqual([]);
    expect(report.rates.every((rate) => rate.scheduled === 0)).toBe(true);
  });

  it("says something sensible for a user with nothing at all", async () => {
    const report = await momentum();
    expect(report.streaks).toEqual([]);
    expect(report.perfect).toEqual({ count: 0, current: 0 });
    expect(report.rates.every((rate) => rate.percent === null)).toBe(true);
  });
});

describe("the endpoint itself", () => {
  it("writes nothing — a report is a read", async () => {
    const id = await routine("Stretch");
    await complete(id, addDays(today(), -1));

    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM occurrence").first<{
      n: number;
    }>();
    await momentum();
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM occurrence").first<{
      n: number;
    }>();

    expect(after?.n).toBe(before?.n);
  });

  it("refuses an unauthenticated request", async () => {
    const response = await app.fetch(new Request("http://localhost/api/reports/momentum"), env);
    expect(response.status).toBe(401);
  });
});

describe("the effort endpoint", () => {
  const effort = async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/reports/effort", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as EffortReport;
  };

  /** A reward, appended the way completing a task appends one. */
  async function reward(coins: number, at: string, occurrenceId: string | null = null) {
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,occurrence_id,created_at) VALUES (?,?,?,'task_reward',?,?)",
    )
      .bind(crypto.randomUUID(), userId, coins, occurrenceId, at)
      .run();
  }

  it("reports minutes as the same number as coins", async () => {
    // A coin is a minute; the report does not get to disagree with the wallet.
    await reward(45, `${today()}T09:00:00Z`);
    const report = await effort();

    const thisWeek = report.weeks.at(-1);
    expect(thisWeek?.minutes).toBe(45);
    expect(thisWeek?.coins).toBe(45);
  });

  it("nets out a reversal, so work taken back stops counting", async () => {
    // The reason minutes come from the ledger and not from occurrence
    // snapshots: uncompleting leaves the snapshot intact by design.
    await reward(45, `${today()}T09:00:00Z`);
    await reward(-45, `${today()}T10:00:00Z`);

    const report = await effort();
    expect(report.weeks.at(-1)?.minutes).toBe(0);
  });

  it("dates the work by the day it was scheduled, not by when the row was written", async () => {
    // Uncompleting last week's task today appends the reversal today. Dating by
    // `created_at` would leave last week overstated and push a negative into
    // this one; dating by the occurrence's own day nets both to zero.
    const taskId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
       VALUES (?,?,?,?,?,'medium','routine',?,?)`,
    )
      .bind(taskId, userId, "Run", 30, 30, WEEKDAYS_MASK_ALL, "2026-07-01T00:00:00Z")
      .run();

    const lastWeek = addDays(today(), -8);
    const occurrenceId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
       VALUES (?,?,?,'pending',null,?)`,
    )
      .bind(occurrenceId, taskId, lastWeek, 30)
      .run();

    // Earned last week, reversed today — both rows carry the same occurrence.
    await reward(30, `${lastWeek}T09:00:00Z`, occurrenceId);
    await reward(-30, `${today()}T10:00:00Z`, occurrenceId);

    const report = await effort();
    for (const bucket of report.weeks) {
      expect(bucket.minutes, bucket.key).toBe(0);
    }
  });

  it("attributes effort to the task's epic", async () => {
    const epicId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO epic (id,user_id,title,accent,created_at) VALUES (?,?,?,?,?)")
      .bind(epicId, userId, "Health", "epic-1", "2026-07-01T00:00:00Z")
      .run();

    const taskId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO task (id,user_id,epic_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
       VALUES (?,?,?,?,?,?,'medium','routine',?,?)`,
    )
      .bind(taskId, userId, epicId, "Run", 30, 30, WEEKDAYS_MASK_ALL, "2026-07-01T00:00:00Z")
      .run();

    const occurrenceId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
       VALUES (?,?,?,'done',?,?)`,
    )
      .bind(occurrenceId, taskId, today(), `${today()}T09:00:00Z`, 30)
      .run();
    await reward(30, `${today()}T09:00:00Z`, occurrenceId);

    const report = await effort();
    expect(report.epics.find((epic) => epic.epicId === epicId)?.minutes).toBe(30);
  });

  it("keeps unassigned effort visible", async () => {
    await reward(20, `${today()}T09:00:00Z`);
    const report = await effort();
    expect(report.epics.find((epic) => epic.epicId === null)?.minutes).toBe(20);
  });

  it("counts the collection by first acquisition, never by duplicate", async () => {
    const albumId = await sealedAlbum();
    const stickerIds = await env.DB.prepare("SELECT id FROM sticker WHERE album_id = ?")
      .bind(albumId)
      .all<{ id: string }>();
    const first = stickerIds.results[0]?.id as string;

    // One sticker, three copies: the collection grew by one.
    await env.DB.prepare(
      "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
    )
      .bind(crypto.randomUUID(), first, 3, `${today()}T09:00:00Z`)
      .run();

    const report = await effort();
    expect(report.collection.at(-1)?.stickers).toBe(1);
  });

  it("shelves an album only once it is complete", async () => {
    const albumId = await sealedAlbum();
    expect((await effort()).albumsCompleted).toBe(0);

    await env.DB.prepare("UPDATE album SET completed_at = ? WHERE id = ?")
      .bind(`${today()}T12:00:00Z`, albumId)
      .run();

    const report = await effort();
    expect(report.albumsCompleted).toBe(1);
    expect(report.shelf[0]).toMatchObject({ albumId, title: "Finished" });
    expect(report.shelf[0]?.coverKey).toBeTruthy();
  });

  it("leaves a deleted album off the shelf", async () => {
    const albumId = await sealedAlbum();
    await env.DB.prepare("UPDATE album SET completed_at = ?, deleted_at = ? WHERE id = ?")
      .bind(`${today()}T12:00:00Z`, `${today()}T13:00:00Z`, albumId)
      .run();

    const report = await effort();
    expect(report.albumsCompleted).toBe(0);
    expect(report.shelf).toEqual([]);
  });

  it("ignores spending entirely — this report is momentum, not economics", async () => {
    // Coin-allocation breakdowns are explicitly out of scope. An album unlock is
    // a big negative ledger row, and counting it would read as negative effort.
    await reward(60, `${today()}T09:00:00Z`);
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,'album_unlock',?)",
    )
      .bind(crypto.randomUUID(), userId, -200, `${today()}T10:00:00Z`)
      .run();
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,'random_pull',?)",
    )
      .bind(crypto.randomUUID(), userId, -40, `${today()}T11:00:00Z`)
      .run();

    const report = await effort();
    expect(report.weeks.at(-1)?.minutes).toBe(60);
    expect(report.epics.find((epic) => epic.epicId === null)?.minutes).toBe(60);
  });

  it("never reports another user's effort", async () => {
    switchTo(await makeUser());
    await reward(999, `${today()}T09:00:00Z`);

    switchTo(await makeUser());
    const report = await effort();
    expect(report.weeks.every((bucket) => bucket.minutes === 0)).toBe(true);
    expect(report.epics).toEqual([]);
  });

  it("never reports another user's collection", async () => {
    const stranger = await makeUser();
    switchTo(stranger);
    const theirAlbum = await sealedAlbum();
    const theirs = await env.DB.prepare("SELECT id FROM sticker WHERE album_id = ? LIMIT 1")
      .bind(theirAlbum)
      .first<{ id: string }>();
    await env.DB.prepare(
      "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,1,?)",
    )
      .bind(crypto.randomUUID(), theirs?.id, `${today()}T09:00:00Z`)
      .run();

    switchTo(await makeUser());
    const report = await effort();
    expect(report.collection.at(-1)?.stickers).toBe(0);
  });

  it("writes nothing", async () => {
    await reward(30, `${today()}T09:00:00Z`);
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    await effort();
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });
});

/** A sealed two-sticker album belonging to the current user. */
async function sealedAlbum(): Promise<string> {
  const albumId = crypto.randomUUID();
  const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;
  await env.DB.prepare(
    `INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
       price_common,price_rare,price_epic,price_legendary,
       odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
     VALUES (?,?,'Finished',?,0,1,1,1,1,1,60,25,12,3,?,?)`,
  )
    .bind(albumId, userId, key(999), "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z")
    .run();

  for (let slot = 0; slot < 2; slot++) {
    await env.DB.prepare(
      "INSERT INTO sticker (id,album_id,image_key,tier,slot_index) VALUES (?,?,?,'common',?)",
    )
      .bind(crypto.randomUUID(), albumId, key(slot + 1), slot)
      .run();
  }
  return albumId;
}
