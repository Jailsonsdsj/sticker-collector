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

function call(path: string, auth = true) {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = `Bearer ${token}`;
  return app.fetch(new Request(`http://localhost${path}`, { headers }), env);
}

function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    env,
  );
}

type Entry = {
  id: string;
  amountCoins: number;
  reason: string;
  occurrenceId: string | null;
  createdAt: string;
};

const wallet = async () => (await (await call("/api/wallet")).json()) as { balance: number };

const page = async (query = "") =>
  (await (await call(`/api/wallet/ledger${query}`)).json()) as {
    entries: Entry[];
    nextCursor: string | null;
  };

/** Appends straight to the table, bypassing every route. */
async function rawLedgerRow(amount: number, createdAt: string, forUser = userId): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,?,?)",
  )
    .bind(id, forUser, amount, "task_reward", createdAt)
    .run();
  return id;
}

async function createTask(): Promise<{ id: string }> {
  const res = await post("/api/tasks", {
    type: "routine",
    title: "Stretch",
    effortMinutes: 15,
    weekdays: DAILY,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

beforeEach(async () => {
  const u = await makeUser();
  userId = u.id;
  token = u.token;
  today = todayIn("UTC");
});

describe("the balance is never read from a column", () => {
  it("no table has a stored balance to read from", async () => {
    const { results: tables } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
    ).all<{ name: string }>();
    expect(tables.length).toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const { name } of tables) {
      const { results: cols } = await env.DB.prepare(`PRAGMA table_info(${name})`).all<{
        name: string;
      }>();
      for (const col of cols) {
        if (/balance|wallet|coins?_total|total_coins/i.test(col.name)) {
          offenders.push(`${name}.${col.name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reflects a row written directly to the table — a cached balance could not", async () => {
    expect((await wallet()).balance).toBe(0);
    await rawLedgerRow(77, "2026-07-02T00:00:00Z");
    expect((await wallet()).balance).toBe(77); // computed on read, not stored
    await rawLedgerRow(-30, "2026-07-03T00:00:00Z");
    expect((await wallet()).balance).toBe(47);
  });

  it("nets a reversal to zero across two rows, because the ledger is append-only", async () => {
    const task = await createTask();
    await post("/api/occurrences/complete", { taskId: task.id, scheduledOn: today });
    expect((await wallet()).balance).toBe(15);

    await post("/api/occurrences/uncomplete", { taskId: task.id, scheduledOn: today });
    expect((await wallet()).balance).toBe(0);

    const { entries } = await page();
    expect(entries).toHaveLength(2); // two rows, not zero
    expect(entries.map((e) => e.amountCoins).sort((a, b) => a - b)).toEqual([-15, 15]);
  });
});

describe("balance", () => {
  it("is 0 for a fresh wallet", async () => {
    expect(await wallet()).toEqual({ balance: 0 });
  });

  it("sums many earnings", async () => {
    for (let i = 1; i <= 5; i++) await rawLedgerRow(i * 10, `2026-07-0${i}T00:00:00Z`);
    expect((await wallet()).balance).toBe(150);
  });

  it("never includes another user's rows", async () => {
    const other = await makeUser();
    await rawLedgerRow(1000, "2026-07-02T00:00:00Z", other.id);
    await rawLedgerRow(5, "2026-07-02T00:00:00Z");
    expect((await wallet()).balance).toBe(5);
  });
});

describe("the ledger page", () => {
  async function seed(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await rawLedgerRow(
        i + 1,
        `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:0${i % 10}Z`,
      );
    }
  }

  it("returns newest first", async () => {
    await rawLedgerRow(1, "2026-07-01T00:00:00Z");
    await rawLedgerRow(2, "2026-07-05T00:00:00Z");
    await rawLedgerRow(3, "2026-07-03T00:00:00Z");

    const { entries } = await page();
    expect(entries.map((e) => e.createdAt)).toEqual([
      "2026-07-05T00:00:00Z",
      "2026-07-03T00:00:00Z",
      "2026-07-01T00:00:00Z",
    ]);
  });

  it("respects limit and reports no next page at the end", async () => {
    await seed(3);
    const first = await page("?limit=2");
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = await page(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it("walks the whole ledger exactly once — no duplicates, no gaps", async () => {
    await seed(25);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 50; guard++) {
      const q: string = cursor ? `?limit=4&cursor=${encodeURIComponent(cursor)}` : "?limit=4";
      const res = await page(q);
      seen.push(...res.entries.map((e) => e.id));
      cursor = res.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25); // every row once
  });

  it("disambiguates rows sharing a timestamp — the reason the key is (created_at, id)", async () => {
    const stamp = "2026-07-02T00:00:00Z";
    for (let i = 0; i < 6; i++) await rawLedgerRow(i + 1, stamp);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const res = await page(cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2");
      seen.push(...res.entries.map((e) => e.id));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(6);
  });

  it("is stable when a newer row arrives mid-pagination — what OFFSET would break", async () => {
    await rawLedgerRow(1, "2026-07-01T00:00:00Z");
    await rawLedgerRow(2, "2026-07-02T00:00:00Z");
    await rawLedgerRow(3, "2026-07-03T00:00:00Z");

    const first = await page("?limit=2");
    const firstIds = first.entries.map((e) => e.id);

    // A completion lands while the user is reading page one.
    await rawLedgerRow(99, "2026-07-09T00:00:00Z");

    const second = await page(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
    // The oldest row is still next, and nothing from page one repeats.
    expect(second.entries).toHaveLength(1);
    expect(firstIds).not.toContain(second.entries[0]?.id);
  });

  it("rejects a limit over the maximum and a malformed cursor", async () => {
    expect((await call("/api/wallet/ledger?limit=101")).status).toBe(400);
    expect((await call("/api/wallet/ledger?limit=0")).status).toBe(400);
    expect((await call("/api/wallet/ledger?cursor=not-a-cursor")).status).toBe(400);
  });

  it("carries the occurrence link and never leaks userId", async () => {
    const task = await createTask();
    await post("/api/occurrences/complete", { taskId: task.id, scheduledOn: today });

    const { entries } = await page();
    expect(entries[0]?.reason).toBe("task_reward");
    expect(entries[0]?.occurrenceId).toBeTypeOf("string");
    expect(entries[0]).not.toHaveProperty("userId");
  });

  it("never returns another user's entries", async () => {
    const other = await makeUser();
    await rawLedgerRow(1000, "2026-07-02T00:00:00Z", other.id);
    expect((await page()).entries).toEqual([]);
  });
});

describe("plumbing", () => {
  it("requires a session", async () => {
    expect((await call("/api/wallet", false)).status).toBe(401);
    expect((await call("/api/wallet/ledger", false)).status).toBe(401);
  });
});
