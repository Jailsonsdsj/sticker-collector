import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { balance, spend } from "../src/lib/ledger";

// balance() and spend() against real D1. Ledger rows can never be deleted (a trigger
// enforces it — the append-only invariant), so tests can't reset the table; instead
// each test uses a fresh user id and scopes all assertions to it.

const TS = "2026-07-01T00:00:00Z";

async function freshUser(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", TS)
    .run();
  return id;
}

async function earn(userId: string, amount: number): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), userId, amount, "task_reward", TS)
    .run();
}

async function ledgerCount(userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("balance()", () => {
  it("is 0 for an empty ledger", async () => {
    const u = await freshUser();
    expect(await balance(env.DB, u)).toBe(0);
  });

  it("is the running sum of the ledger (earnings minus debits)", async () => {
    const u = await freshUser();
    await earn(u, 100);
    await earn(u, 30);
    await spend(env.DB, {
      id: crypto.randomUUID(),
      userId: u,
      amountCoins: -50,
      reason: "album_unlock",
    });
    expect(await balance(env.DB, u)).toBe(80);
  });

  it("is scoped per user", async () => {
    const a = await freshUser();
    const b = await freshUser();
    await earn(a, 100);
    expect(await balance(env.DB, a)).toBe(100);
    expect(await balance(env.DB, b)).toBe(0);
  });
});

describe("spend()", () => {
  it("debits and writes exactly one row when funds cover it", async () => {
    const u = await freshUser();
    await earn(u, 100);
    const before = await ledgerCount(u);

    const res = await spend(env.DB, {
      id: crypto.randomUUID(),
      userId: u,
      amountCoins: -30,
      reason: "sticker_buy",
    });

    expect(res.ok).toBe(true);
    expect(await ledgerCount(u)).toBe(before + 1);
    expect(await balance(env.DB, u)).toBe(70);
  });

  it("allows spending down to exactly zero", async () => {
    const u = await freshUser();
    await earn(u, 70);
    const res = await spend(env.DB, {
      id: crypto.randomUUID(),
      userId: u,
      amountCoins: -70,
      reason: "album_unlock",
    });
    expect(res.ok).toBe(true);
    expect(await balance(env.DB, u)).toBe(0);
  });

  it("rejects an overspend with ok:false and writes ZERO rows", async () => {
    const u = await freshUser();
    await earn(u, 100);
    const before = await ledgerCount(u);

    const res = await spend(env.DB, {
      id: crypto.randomUUID(),
      userId: u,
      amountCoins: -150,
      reason: "album_unlock",
    });

    expect(res.ok).toBe(false);
    expect(await ledgerCount(u)).toBe(before); // nothing written
    expect(await balance(env.DB, u)).toBe(100); // balance untouched
  });

  it("rejects a spend against an empty wallet", async () => {
    const u = await freshUser();
    const res = await spend(env.DB, {
      id: crypto.randomUUID(),
      userId: u,
      amountCoins: -1,
      reason: "random_pull",
    });
    expect(res.ok).toBe(false);
    expect(await ledgerCount(u)).toBe(0);
  });
});
