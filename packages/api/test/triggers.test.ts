import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

// The CI-enforced counterpart to scripts/verify-triggers.sh: every DB invariant
// from 0001_init, asserted against a real local D1 inside the Workers runtime.
//
// Ledger rows can never be deleted (that is one of the invariants under test), so
// fixtures cannot be reset by deletion between tests. Each test therefore seeds its
// own chain under a unique id prefix — independent of any storage-isolation behaviour.

const TS = "2026-07-23T00:00:00Z";

interface Ids {
  user: string;
  album: string;
  sticker: string;
  task: string;
  occSet: string;
  occNull: string;
  ledger: string;
}

let ids: Ids;

async function seed(): Promise<Ids> {
  const p = crypto.randomUUID();
  const id: Ids = {
    user: `${p}_user`,
    album: `${p}_album`,
    sticker: `${p}_sticker`,
    task: `${p}_task`,
    occSet: `${p}_occ_set`,
    occNull: `${p}_occ_null`,
    ledger: `${p}_ledger`,
  };

  // user -> album(sealed, valid odds) -> sticker -> task -> occurrences -> ledger.
  // One atomic batch, mirroring how the app writes multi-statement mutations.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(id.user, "h", "s", 600000, "UTC", TS),
    env.DB.prepare(
      `INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
        price_common,price_rare,price_epic,price_legendary,
        odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
       VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?)`,
    ).bind(id.album, id.user, "A", "img/c.jpg", 100, 10, 5, 10, 20, 50, 60, 25, 12, 3, TS, TS),
    env.DB.prepare(
      "INSERT INTO sticker (id,album_id,image_key,tier,slot_index) VALUES (?,?,?,?,?)",
    ).bind(id.sticker, id.album, "img/s.jpg", "common", 0),
    env.DB.prepare(
      "INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(id.task, id.user, "T", 30, 30, "medium", "oneoff", TS),
    env.DB.prepare(
      "INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins) VALUES (?,?,?,?,?,?)",
    ).bind(id.occSet, id.task, "2026-07-23", "done", TS, 30),
    env.DB.prepare("INSERT INTO occurrence (id,task_id,scheduled_on,status) VALUES (?,?,?,?)").bind(
      id.occNull,
      id.task,
      "2026-07-24",
      "pending",
    ),
    env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,?,?)",
    ).bind(id.ledger, id.user, 30, "task_reward", TS),
  ]);

  return id;
}

beforeEach(async () => {
  ids = await seed();
});

describe("forbidden mutations are rejected by the database", () => {
  it("ledger UPDATE is blocked (ledger_no_update)", async () => {
    await expect(
      env.DB.prepare("UPDATE ledger SET amount_coins = 999 WHERE id = ?").bind(ids.ledger).run(),
    ).rejects.toThrow(/ledger is append-only/);
  });

  it("ledger DELETE is blocked (ledger_no_delete)", async () => {
    await expect(
      env.DB.prepare("DELETE FROM ledger WHERE id = ?").bind(ids.ledger).run(),
    ).rejects.toThrow(/ledger is append-only/);
  });

  it("a sealed album's random_price cannot change (album_sealed_frozen)", async () => {
    await expect(
      env.DB.prepare("UPDATE album SET random_price = 999 WHERE id = ?").bind(ids.album).run(),
    ).rejects.toThrow(/sealed album economics are immutable/);
  });

  it("an already-set coin snapshot cannot be overwritten (occurrence_snapshot_write_once)", async () => {
    await expect(
      env.DB.prepare("UPDATE occurrence SET reward_snapshot_coins = 999 WHERE id = ?")
        .bind(ids.occSet)
        .run(),
    ).rejects.toThrow(/coin snapshot is write-once/);
  });

  it("a sticker row cannot be updated (sticker_frozen)", async () => {
    await expect(
      env.DB.prepare("UPDATE sticker SET slot_index = 5 WHERE id = ?").bind(ids.sticker).run(),
    ).rejects.toThrow(/sticker rows are immutable/);
  });

  it("an album whose odds sum to 99 is rejected (CHECK album_odds_sum_100)", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
          price_common,price_rare,price_epic,price_legendary,
          odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
         VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?)`,
      )
        .bind(
          `${ids.album}_99`,
          ids.user,
          "A",
          "img/c.jpg",
          100,
          10,
          5,
          10,
          20,
          50,
          60,
          25,
          12,
          2,
          TS,
          TS,
        )
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: album_odds_sum_100/);
  });

  it("an album with NULL odds is rejected by NOT NULL, not just the CHECK", async () => {
    // NULL + NULL + ... = 100 evaluates to NULL, which SQLite's CHECK treats as
    // "not violated" — so NOT NULL on the odds columns is what actually closes the hole.
    await expect(
      env.DB.prepare(
        `INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
          price_common,price_rare,price_epic,price_legendary,
          odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
         VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?)`,
      )
        .bind(
          `${ids.album}_null`,
          ids.user,
          "A",
          "img/c.jpg",
          100,
          10,
          5,
          10,
          20,
          50,
          null,
          null,
          null,
          null,
          TS,
          TS,
        )
        .run(),
    ).rejects.toThrow(/NOT NULL constraint failed: album\.odds_/);
  });

  it("a holding with quantity 0 is rejected (CHECK holding_quantity_min_1)", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
      )
        .bind(`${ids.sticker}_h0`, ids.sticker, 0, TS)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: holding_quantity_min_1/);
  });

  it("a holding with NULL quantity is rejected by NOT NULL", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
      )
        .bind(`${ids.sticker}_hnull`, ids.sticker, null, TS)
        .run(),
    ).rejects.toThrow(/NOT NULL constraint failed: holding\.quantity/);
  });
});

describe("permitted mutations still succeed (a trigger that blocks everything is broken too)", () => {
  it("appends a new ledger row", async () => {
    const res = await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,album_id,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(`${ids.ledger}_2`, ids.user, -100, "album_unlock", ids.album, TS)
      .run();
    expect(res.success).toBe(true);
  });

  it("updates a NON-economic column on a sealed album (trigger is selective)", async () => {
    // album.sealed_at is NOT NULL — albums are sealed on create, so an "unsealed
    // album" cannot exist. Updating unlocked_at on a SEALED album is the meaningful
    // proof that album_sealed_frozen fires only on price/odds columns.
    const res = await env.DB.prepare("UPDATE album SET unlocked_at = ? WHERE id = ?")
      .bind(TS, ids.album)
      .run();
    expect(res.success).toBe(true);
  });

  it("writes a coin snapshot that was previously NULL", async () => {
    const res = await env.DB.prepare(
      "UPDATE occurrence SET status = 'done', completed_at = ?, reward_snapshot_coins = 30 WHERE id = ?",
    )
      .bind(TS, ids.occNull)
      .run();
    expect(res.success).toBe(true);
  });
});
