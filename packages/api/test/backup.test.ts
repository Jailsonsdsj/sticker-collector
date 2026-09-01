import { env } from "cloudflare:test";
import type { BackupManifest, CreateAlbumInput } from "@sticker-collector/shared";
import { DEFAULT_ODDS, WEEKDAYS_MASK_ALL } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * Backup and restore.
 *
 * The row's criterion is a **round trip**: export an account, restore it, and
 * find the same balance, albums, holdings and images on the other side. That is
 * exactly what these run — against a real D1, with the real triggers in place,
 * which is what makes the restore path's one hard constraint visible.
 */

let token: string;
let userId: string;

async function makeUser(timezone = "UTC"): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, `hash-${id}`, `salt-${id}`, 600000, timezone, "2026-07-01T00:00:00Z")
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

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

const request = (path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
    }),
    env,
  );

const exportManifest = async () => {
  const response = await request("/api/backup/manifest");
  expect(response.status).toBe(200);
  return (await response.json()) as BackupManifest;
};

const restore = (manifest: unknown) =>
  request("/api/backup/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });

const scalar = async (sql: string, ...binds: unknown[]) =>
  (
    (await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ v: number }>()) as { v: number }
  ).v;

const balanceOf = (id: string) =>
  scalar("SELECT COALESCE(SUM(amount_coins),0) AS v FROM ledger WHERE user_id = ?", id);

/** An account with something in every table worth restoring. */
async function seedAccount(stickerCount = 3) {
  const epicId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO epic (id,user_id,title,accent,created_at) VALUES (?,?,?,?,?)")
    .bind(epicId, userId, "Health", "epic-2", "2026-07-01T00:00:00Z")
    .run();

  const taskId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO task (id,user_id,epic_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
     VALUES (?,?,?,?,?,?,'high','routine',?,?)`,
  )
    .bind(taskId, userId, epicId, "Stretch", 45, 45, WEEKDAYS_MASK_ALL, "2026-07-01T00:00:00Z")
    .run();

  // A routine's agenda times and its checklist. Both hang off the task, and
  // both are the kind of child table this manifest names by hand — which is
  // how `routine_slot` came to be missing from every backup taken before this.
  await env.DB.prepare(
    "INSERT INTO routine_slot (id,task_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), taskId, 0, 540, 600)
    .run();
  await env.DB.prepare("INSERT INTO subtask (id,task_id,title,position,done_on) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), taskId, "Roll the mat", 0, "2026-07-20")
    .run();

  const occurrenceId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
     VALUES (?,?,?,'done',?,?)`,
  )
    .bind(occurrenceId, taskId, "2026-07-20", "2026-07-20T09:00:00Z", 45)
    .run();

  await env.DB.prepare(
    "INSERT INTO ledger (id,user_id,amount_coins,reason,occurrence_id,created_at) VALUES (?,?,?,'task_reward',?,?)",
  )
    .bind(crypto.randomUUID(), userId, 45, occurrenceId, "2026-07-20T09:00:00Z")
    .run();

  const body: CreateAlbumInput = {
    title: "Kitchen heroes",
    description: "Everyone who feeds me",
    coverKey: key(999),
    unlockPrice: 0,
    randomPrice: 40,
    prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
    odds: DEFAULT_ODDS,
    stickers: Array.from({ length: stickerCount }, (_, i) => ({
      imageKey: key(i + 1),
      tier: "common" as const,
    })),
  };
  const sealed = await request("/api/albums", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(sealed.status).toBe(201);
  const album = (await sealed.json()) as { album: { id: string }; stickers: { id: string }[] };

  // Two copies of the first sticker, so quantities have to survive too.
  await env.DB.prepare(
    "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
  )
    .bind(crypto.randomUUID(), album.stickers[0]?.id, 2, "2026-07-21T09:00:00Z")
    .run();

  return { epicId, taskId, albumId: album.album.id, stickers: album.stickers };
}

beforeEach(async () => {
  switchTo(await makeUser());
});

describe("the round trip", () => {
  it("reproduces the balance, the albums, the holdings and the images exactly", async () => {
    const seeded = await seedAccount();
    const manifest = await exportManifest();
    const originalBalance = await balanceOf(userId);

    // A fresh account — which is what a restore is for.
    const fresh = await makeUser("Europe/Lisbon");
    switchTo(fresh);
    expect((await restore(manifest)).status).toBe(201);

    expect(await balanceOf(fresh.id)).toBe(originalBalance);

    const restored = await exportManifest();
    expect(restored.albums).toHaveLength(manifest.albums.length);
    expect(restored.stickers).toHaveLength(manifest.stickers.length);
    expect(restored.holdings).toHaveLength(manifest.holdings.length);
    expect([...restored.imageKeys].sort()).toEqual([...manifest.imageKeys].sort());

    // Compared on **content**, not identity: ids and the columns that reference
    // them are deliberately remapped, so that a backup can be restored into a
    // database that already holds rows with those ids.
    const content = (rows: Record<string, unknown>[], drop: string[]) =>
      rows
        .map((row) => {
          const copy: Record<string, unknown> = {};
          for (const [column, value] of Object.entries(row)) {
            if (!drop.includes(column)) copy[column] = value;
          }
          return copy;
        })
        .map((row) => JSON.stringify(row, Object.keys(row).sort()))
        .sort();

    expect(content(restored.albums, ["id", "userId", "derivedFromAlbumId"])).toEqual(
      content(manifest.albums, ["id", "userId", "derivedFromAlbumId"]),
    );
    expect(content(restored.stickers, ["id", "albumId"])).toEqual(
      content(manifest.stickers, ["id", "albumId"]),
    );
    expect(content(restored.holdings, ["id", "stickerId"])).toEqual(
      content(manifest.holdings, ["id", "stickerId"]),
    );
    expect(content(restored.tasks, ["id", "userId", "epicId"])).toEqual(
      content(manifest.tasks, ["id", "userId", "epicId"]),
    );
    expect(content(restored.epics, ["id", "userId"])).toEqual(
      content(manifest.epics, ["id", "userId"]),
    );
    expect(content(restored.occurrences, ["id", "taskId"])).toEqual(
      content(manifest.occurrences, ["id", "taskId"]),
    );
    const ledgerRefs = ["id", "userId", "occurrenceId", "albumId", "stickerId", "puzzleId"];
    expect(content(restored.ledger, ledgerRefs)).toEqual(content(manifest.ledger, ledgerRefs));

    // The ids really are new — the point of the remapping.
    expect(restored.albums[0]?.id).not.toBe(seeded.albumId);
    expect(restored.albums[0]?.title).toBe("Kitchen heroes");
  });

  it("keeps the internal references pointing at the right rows", async () => {
    // Remapping is only safe if every reference moves with its parent. The
    // giveaway would be a task attached to the wrong epic, or a ledger row
    // pointing at someone else's occurrence.
    await seedAccount();
    const manifest = await exportManifest();

    switchTo(await makeUser());
    expect((await restore(manifest)).status).toBe(201);

    const joined = await env.DB.prepare(
      `SELECT e.title AS epic, t.title AS task, o.scheduled_on AS day, l.amount_coins AS coins
       FROM ledger l
       JOIN occurrence o ON o.id = l.occurrence_id
       JOIN task t ON t.id = o.task_id
       JOIN epic e ON e.id = t.epic_id
       WHERE l.user_id = ?`,
    )
      .bind(userId)
      .first<{ epic: string; task: string; day: string; coins: number }>();

    expect(joined).toEqual({
      epic: "Health",
      task: "Stretch",
      day: "2026-07-20",
      coins: 45,
    });
  });

  it("lists every image the data references", async () => {
    // The irreplaceable half: originals are discarded on import, so a
    // data-only backup is not a backup at all.
    await seedAccount(3);
    const manifest = await exportManifest();

    expect([...manifest.imageKeys].sort()).toEqual([key(1), key(2), key(3), key(999)].sort());
  });

  it("lists each image once, however many rows point at it", async () => {
    // A derived edition shares its keys with the source; the client should
    // fetch one copy of each.
    await seedAccount(2);
    const first = await exportManifest();

    const edition = await request("/api/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Second edition",
        coverKey: key(999),
        unlockPrice: 0,
        randomPrice: 1,
        prices: { common: 1, rare: 1, epic: 1, legendary: 1 },
        odds: DEFAULT_ODDS,
        stickers: [{ imageKey: key(1), tier: "common" }],
        derivedFromAlbumId: first.albums[0]?.id,
      }),
    });
    expect(edition.status).toBe(201);

    const manifest = await exportManifest();
    expect(new Set(manifest.imageKeys).size).toBe(manifest.imageKeys.length);
    expect([...manifest.imageKeys].sort()).toEqual([key(1), key(2), key(999)].sort());
  });

  it("keeps the duplicate counts", async () => {
    await seedAccount();
    const manifest = await exportManifest();

    switchTo(await makeUser());
    await restore(manifest);

    const quantities = await env.DB.prepare(
      `SELECT h.quantity AS q FROM holding h
       JOIN sticker s ON s.id = h.sticker_id
       JOIN album a ON a.id = s.album_id
       WHERE a.user_id = ?`,
    )
      .bind(userId)
      .all<{ q: number }>();
    expect(quantities.results.map((row) => row.q).sort()).toEqual([2]);
  });

  it("carries the timezone across", async () => {
    await seedAccount();
    switchTo(await makeUser("America/Sao_Paulo"));
    const manifest = await exportManifest();
    expect(manifest.user.timezone).toBe("America/Sao_Paulo");
  });

  it("restores an account that owns nothing at all", async () => {
    const manifest = await exportManifest();
    switchTo(await makeUser());
    expect((await restore(manifest)).status).toBe(201);
  });
});

describe("what a backup refuses to carry", () => {
  it("contains no passphrase hash, salt or iteration count", async () => {
    // The spec's recovery story is that a *lost passphrase* is recovered by
    // restoring the export. A file carrying the old credential defeats it, and
    // is a credential file besides.
    await seedAccount();
    const manifest = await exportManifest();
    const serialised = JSON.stringify(manifest);

    expect(serialised).not.toContain("auth_key_hash");
    expect(serialised).not.toContain("authKeyHash");
    expect(serialised).not.toContain(`hash-${userId}`);
    expect(serialised).not.toContain(`salt-${userId}`);
    expect(manifest.user).toEqual({ timezone: "UTC" });
  });

  it("contains no idempotency keys", async () => {
    // Replaying them after a restore makes the next retry of any mutation
    // return a stale response from a previous life.
    await env.DB.prepare("INSERT INTO mutation (key, response_json, created_at) VALUES (?,?,?)")
      .bind("some-key", '{"status":201}', "2026-07-20T00:00:00Z")
      .run();

    const manifest = await exportManifest();
    expect(JSON.stringify(manifest)).not.toContain("some-key");
  });
});

describe("restoring over existing data", () => {
  it("is refused with a message, not a trigger abort", async () => {
    // `ledger_no_delete` makes clearing the ledger impossible by design, so the
    // refusal has to come first and say why.
    await seedAccount();
    const manifest = await exportManifest();

    const response = await restore(manifest);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toMatch(/fresh account/i);
  });

  it("leaves the existing data untouched", async () => {
    await seedAccount();
    const manifest = await exportManifest();
    const before = await balanceOf(userId);
    const albumsBefore = await scalar("SELECT COUNT(*) AS v FROM album WHERE user_id = ?", userId);

    await restore(manifest);

    expect(await balanceOf(userId)).toBe(before);
    expect(await scalar("SELECT COUNT(*) AS v FROM album WHERE user_id = ?", userId)).toBe(
      albumsBefore,
    );
  });

  it("refuses an account holding only tasks, before any coins exist", async () => {
    await env.DB.prepare(
      `INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,weekdays,created_at)
       VALUES (?,?,?,?,?,'low','routine',?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        "Stretch",
        10,
        10,
        WEEKDAYS_MASK_ALL,
        "2026-07-01T00:00:00Z",
      )
      .run();

    expect((await restore({ ...(await exportManifest()) })).status).toBe(409);
  });
});

describe("size and order", () => {
  it("restores an album at the sticker cap without hitting D1's parameter limit", async () => {
    // 200 stickers is the sealed maximum (A-03), and D1 binds 100 parameters
    // per statement — the same ceiling, met from the other direction.
    await seedAccount(200);
    const manifest = await exportManifest();
    expect(manifest.stickers).toHaveLength(200);

    switchTo(await makeUser());
    const response = await restore(manifest);
    expect(response.status).toBe(201);
    expect(
      await scalar(
        "SELECT COUNT(*) AS v FROM sticker s JOIN album a ON a.id = s.album_id WHERE a.user_id = ?",
        userId,
      ),
    ).toBe(200);
  });

  it("writes nothing at all when a restore fails part way through", async () => {
    // The rows go in as one batch, and this is what that buys: a half-restored
    // account — epics and tasks but no albums — would look like a successful
    // restore and be missing half the user's history.
    await seedAccount();
    const manifest = await exportManifest();

    await env.DB.prepare(
      `CREATE TRIGGER reject_sticker BEFORE INSERT ON sticker
       BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
    ).run();

    try {
      switchTo(await makeUser());
      const response = await restore(manifest);
      expect(response.status).toBeGreaterThanOrEqual(500);

      // Epics and tasks are inserted *before* stickers. If they survived, the
      // batch was not a batch.
      expect(await scalar("SELECT COUNT(*) AS v FROM epic WHERE user_id = ?", userId)).toBe(0);
      expect(await scalar("SELECT COUNT(*) AS v FROM task WHERE user_id = ?", userId)).toBe(0);
      expect(await scalar("SELECT COUNT(*) AS v FROM album WHERE user_id = ?", userId)).toBe(0);
      expect(await balanceOf(userId)).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS reject_sticker").run();
    }
  });

  it("inserts parents before children, or the foreign keys would refuse", async () => {
    await seedAccount();
    const manifest = await exportManifest();

    switchTo(await makeUser());
    expect((await restore(manifest)).status).toBe(201);

    // Every restored sticker still points at a real album, and every holding at
    // a real sticker.
    expect(
      await scalar(
        `SELECT COUNT(*) AS v FROM sticker s LEFT JOIN album a ON a.id = s.album_id
         WHERE a.id IS NULL`,
      ),
    ).toBe(0);
    expect(
      await scalar(
        `SELECT COUNT(*) AS v FROM holding h LEFT JOIN sticker s ON s.id = h.sticker_id
         WHERE s.id IS NULL`,
      ),
    ).toBe(0);
  });
});

describe("isolation and validation", () => {
  it("never exports another user's rows", async () => {
    const mine = { id: userId, token };
    switchTo(await makeUser());
    await seedAccount();

    switchTo(mine);
    const manifest = await exportManifest();
    expect(manifest.albums).toEqual([]);
    expect(manifest.ledger).toEqual([]);
    expect(manifest.imageKeys).toEqual([]);
  });

  it("refuses something that is not a backup", async () => {
    expect((await restore({ hello: "world" })).status).toBe(400);
    expect((await restore(null)).status).toBe(400);
  });

  it("refuses a backup from a future version", async () => {
    await seedAccount();
    const manifest = await exportManifest();
    switchTo(await makeUser());

    expect((await restore({ ...manifest, version: 99 })).status).toBe(400);
  });

  it("refuses both endpoints without a session", async () => {
    const manifest = await app.fetch(new Request("http://localhost/api/backup/manifest"), env);
    expect(manifest.status).toBe(401);

    const restored = await app.fetch(
      new Request("http://localhost/api/backup/restore", { method: "POST", body: "{}" }),
      env,
    );
    expect(restored.status).toBe(401);
  });
});

describe("puzzles survive the round trip", () => {
  /** A puzzle with one piece bought and the coins that bought it. */
  async function seedPuzzle() {
    const puzzleId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO puzzle (id,user_id,title,description,image_key,unlock_price,piece_price,rows,cols,hide_locked,sealed_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        puzzleId,
        userId,
        "The harbour",
        null,
        PUZZLE_KEY,
        300,
        25,
        6,
        8,
        1,
        "2026-08-01T00:00:00Z",
        "2026-08-01T00:00:00Z",
      )
      .run();
    await env.DB.prepare(
      "INSERT INTO puzzle_piece (id,puzzle_id,piece_index,acquired_at) VALUES (?,?,?,?)",
    )
      .bind(crypto.randomUUID(), puzzleId, 5, "2026-08-02T00:00:00Z")
      .run();
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,puzzle_id,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), userId, -25, "piece_unlock", puzzleId, "2026-08-02T00:00:00Z")
      .run();
    return puzzleId;
  }

  const PUZZLE_KEY = `img/${"c".repeat(64)}.jpg`;

  it("carries the puzzle, its pieces and its master image", async () => {
    // `backup.ts` names its tables by hand. A table missing from either
    // direction is data that vanishes on restore with nothing to say so — and
    // the master image is the irreplaceable half.
    await seedAccount();
    await seedPuzzle();

    const manifest = await exportManifest();
    expect(manifest.puzzles).toHaveLength(1);
    expect(manifest.puzzlePieces).toHaveLength(1);
    expect(manifest.imageKeys).toContain(PUZZLE_KEY);

    const fresh = await makeUser("Europe/Lisbon");
    switchTo(fresh);
    expect((await restore(manifest)).status).toBe(201);

    const restored = await exportManifest();
    expect(restored.puzzles).toHaveLength(1);
    expect(restored.puzzles[0]).toMatchObject({ title: "The harbour", rows: 6, cols: 8 });
    expect(restored.puzzlePieces).toHaveLength(1);
    expect(restored.puzzlePieces[0]).toMatchObject({ pieceIndex: 5 });
  });

  it("keeps a piece attached to its own puzzle after the ids are remapped", async () => {
    await seedAccount();
    await seedPuzzle();
    const manifest = await exportManifest();

    const fresh = await makeUser("Europe/Lisbon");
    switchTo(fresh);
    await restore(manifest);

    const restored = await exportManifest();
    expect(restored.puzzlePieces[0]?.puzzleId).toBe(restored.puzzles[0]?.id);
    // And the id really did move, which is the point of remapping.
    expect(restored.puzzles[0]?.id).not.toBe(manifest.puzzles[0]?.id);
  });

  it("keeps a puzzle spend pointing at its puzzle", async () => {
    await seedAccount();
    await seedPuzzle();
    const manifest = await exportManifest();

    const fresh = await makeUser("Europe/Lisbon");
    switchTo(fresh);
    await restore(manifest);

    const restored = await exportManifest();
    const spend = restored.ledger.find((row) => row.reason === "piece_unlock");
    expect(spend?.puzzleId).toBe(restored.puzzles[0]?.id);
  });

  it("restores a backup taken before puzzles existed", async () => {
    // The reason `puzzles` is optional rather than a version bump: the old file
    // is exactly the one someone reaches for when they most need it.
    await seedAccount();
    const manifest = await exportManifest();
    const old = { ...manifest };
    delete (old as Record<string, unknown>).puzzles;
    delete (old as Record<string, unknown>).puzzlePieces;

    const fresh = await makeUser("Europe/Lisbon");
    switchTo(fresh);

    expect((await restore(old as typeof manifest)).status).toBe(201);
    expect((await exportManifest()).puzzles).toEqual([]);
  });
});

describe("the child tables that hang off a task", () => {
  it("carries a routine's agenda times through a restore", async () => {
    // They were **missing from the manifest entirely**: a restored routine came
    // back with its schedule and none of its times, silently, because the
    // export names its tables by hand and nobody had named this one.
    await seedAccount();
    const manifest = await exportManifest();

    const fresh = await makeUser();
    switchTo(fresh);
    expect((await restore(manifest)).status).toBe(201);

    const slots = await env.DB.prepare(
      "SELECT s.weekday, s.start_min, s.end_min FROM routine_slot s JOIN task t ON t.id = s.task_id WHERE t.user_id = ?",
    )
      .bind(fresh.id)
      .all();
    expect(slots.results).toEqual([{ weekday: 0, start_min: 540, end_min: 600 }]);
  });

  it("carries a task's steps, and the day each was ticked", async () => {
    await seedAccount();
    const manifest = await exportManifest();

    const fresh = await makeUser();
    switchTo(fresh);
    await restore(manifest);

    const steps = await env.DB.prepare(
      "SELECT s.title, s.position, s.done_on FROM subtask s JOIN task t ON t.id = s.task_id WHERE t.user_id = ?",
    )
      .bind(fresh.id)
      .all();
    expect(steps.results).toEqual([{ title: "Roll the mat", position: 0, done_on: "2026-07-20" }]);
  });

  it("points them at the restored task, not the one they came from", async () => {
    // Ids are minted fresh on restore, so a child whose parent reference was
    // not remapped would hang off a task in the account it came from.
    const seeded = await seedAccount();
    const manifest = await exportManifest();

    switchTo(await makeUser());
    await restore(manifest);

    const original = await env.DB.prepare("SELECT COUNT(*) AS n FROM subtask WHERE task_id = ?")
      .bind(seeded.taskId)
      .first<{ n: number }>();
    expect(original?.n).toBe(1); // the original only — the copy points elsewhere
  });

  it("restores a backup taken before either existed", async () => {
    // Both default to empty, so an old file — the one someone reaches for when
    // they most need it — still restores.
    await seedAccount();
    const manifest = (await exportManifest()) as unknown as Record<string, unknown>;
    delete manifest.routineSlots;
    delete manifest.subtasks;

    switchTo(await makeUser());
    expect((await restore(manifest)).status).toBe(201);
  });
});
