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
async function routine(
  title: string,
  weekdays = WEEKDAYS_MASK_ALL,
  effortMinutes = 30,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
     VALUES (?,?,?,?,?,'medium','routine',?,?)`,
  )
    .bind(id, userId, title, effortMinutes, effortMinutes, weekdays, "2026-07-01T00:00:00Z")
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
      // Minutes travel with the counts: the score is a proportion of time, and
      // the client cannot weigh a day it was only sent headcounts for.
      scheduledMinutes: 30,
      doneMinutes: 30,
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
  it("writes no task data — only the grades of days that have closed", async () => {
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

describe("the minutes a day is weighed by", () => {
  it("reports the day's real minutes, from each task's own effort", async () => {
    // NON-default efforts on purpose: with everything at 30 minutes, a server
    // that ignored the column and hardcoded 30 would be indistinguishable from
    // one that read it.
    const yesterday = addDays(today(), -1);
    await routine("Quick", WEEKDAYS_MASK_ALL, 5);
    const long = await routine("Long", WEEKDAYS_MASK_ALL, 115);
    await complete(long, yesterday);

    const report = await momentum();
    const day = report.days.find((d) => d.date === yesterday);

    expect(day).toEqual({
      date: yesterday,
      scheduled: 2,
      done: 1,
      scheduledMinutes: 120,
      doneMinutes: 115,
    });
  });
});

describe("a day's grade", () => {
  const dayOf = (report: MomentumReport, date: string) =>
    report.days.find((day) => day.date === date);

  async function oneoff(title: string): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,created_at)
       VALUES (?,?,?,?,?,'medium','oneoff',?)`,
    )
      .bind(id, userId, title, 30, 30, "2026-07-01T00:00:00Z")
      .run();
    return id;
  }

  /** A completion of `scheduledOn`'s run, ticked on `doneOn`. */
  async function completeLate(taskId: string, scheduledOn: string, doneOn: string) {
    await env.DB.prepare(
      `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
       VALUES (?,?,?,'done',?,30)`,
    )
      .bind(crypto.randomUUID(), taskId, scheduledOn, `${doneOn}T09:00:00Z`)
      .run();
  }

  it("counts a one-off on the day it was done, beside the routines", async () => {
    // The reported bug: only routines were graded, so an undated one-off was
    // in no day at all.
    const yesterday = addDays(today(), -1);
    await routine("Stretch");
    const call = await oneoff("Call the bank");
    await completeLate(call, yesterday, yesterday);

    expect(dayOf(await momentum(), yesterday)).toMatchObject({ scheduled: 2, done: 1 });
  });

  it("grades a late run on the day it was ticked, and leaves the miss on its own day", async () => {
    const yesterday = addDays(today(), -1);
    const earlier = addDays(today(), -3);
    const id = await routine("Stretch");
    await completeLate(id, earlier, yesterday);

    const report = await momentum();

    expect(dayOf(report, earlier)).toMatchObject({ scheduled: 1, done: 0 });
    expect(dayOf(report, yesterday)).toMatchObject({ scheduled: 2, done: 1 });
  });

  it("is frozen once the day has closed — a later edit to the routine does not reach it", async () => {
    const yesterday = addDays(today(), -1);
    const id = await routine("Stretch", WEEKDAYS_MASK_ALL, 30);
    await complete(id, yesterday);
    const before = dayOf(await momentum(), yesterday);

    // Change everything the grade is computed from.
    await env.DB.prepare("UPDATE task SET weekdays = 0, effort_minutes = 90 WHERE id = ?")
      .bind(id)
      .run();
    await routine("Added later");

    expect(dayOf(await momentum(), yesterday)).toEqual(before);
  });

  it("keeps today live, because it has not closed", async () => {
    const id = await routine("Stretch");
    await momentum();
    await complete(id, today());

    expect(dayOf(await momentum(), today())).toMatchObject({ scheduled: 1, done: 1 });
    const stored = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM day_score WHERE user_id = ? AND date = ?",
    )
      .bind(userId, today())
      .first<{ n: number }>();
    expect(stored?.n).toBe(0);
  });

  it("stores each closed day once", async () => {
    await routine("Stretch");
    await momentum();
    await momentum();

    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n, COUNT(DISTINCT date) AS d FROM day_score WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ n: number; d: number }>();
    expect(rows?.n).toBe(rows?.d);
    expect(rows?.n).toBeGreaterThan(0);
  });
});

describe("what was done on a day", () => {
  const dayList = async (date: string) => {
    const response = await app.fetch(
      new Request(`http://localhost/api/reports/day/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { taskId: string; scheduledOn: string }[];
  };

  async function tick(taskId: string, scheduledOn: string, doneOn: string) {
    await env.DB.prepare(
      `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
       VALUES (?,?,?,'done',?,30)`,
    )
      .bind(crypto.randomUUID(), taskId, scheduledOn, `${doneOn}T09:00:00Z`)
      .run();
  }

  it("lists a late run on the day it was ticked, not the day it was for", async () => {
    const monday = addDays(today(), -3);
    const wednesday = addDays(today(), -1);
    const id = await routine("Stretch");
    await tick(id, monday, wednesday);

    expect(await dayList(wednesday)).toEqual([expect.objectContaining({ taskId: id })]);
    expect(await dayList(monday)).toEqual([]);
  });

  it("finds a one-off finished long after its due date", async () => {
    // Its row stays filed under the due date, weeks back — out of reach of any
    // window keyed by the scheduled day.
    const id = await routine("Old due date");
    await tick(id, addDays(today(), -40), addDays(today(), -1));

    expect(await dayList(addDays(today(), -1))).toHaveLength(1);
  });

  it("never lists another user's work", async () => {
    const id = await routine("Mine");
    await tick(id, addDays(today(), -1), addDays(today(), -1));
    switchTo(await makeUser());

    expect(await dayList(addDays(today(), -1))).toEqual([]);
  });

  it("refuses something that is not a date", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/reports/day/yesterday", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.status).toBe(400);
  });
});
