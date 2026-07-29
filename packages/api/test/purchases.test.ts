import { env } from "cloudflare:test";
import { type CreateAlbumInput, DEFAULT_ODDS } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * Spending. The assertions that matter are about what is *not* written when a
 * purchase fails: `architecture.md` §4.3 claims a batch rolls back when the
 * conditional insert matches nothing, and it does not — so every failure path
 * here counts rows rather than trusting a status code.
 */

let token: string;
let userId: string;

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

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

function post(path: string, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...headers },
    }),
    env,
  );
}

async function seal(over: Partial<CreateAlbumInput> = {}) {
  const body: CreateAlbumInput = {
    title: "Kitchen heroes",
    description: null,
    coverKey: key(999),
    unlockPrice: 100,
    randomPrice: 40,
    prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
    odds: DEFAULT_ODDS,
    stickers: [
      { imageKey: key(1), tier: "common" },
      { imageKey: key(2), tier: "rare" },
      { imageKey: key(3), tier: "legendary" },
    ],
    ...over,
  };
  const response = await app.fetch(
    new Request("http://localhost/api/albums", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    album: { id: string };
    stickers: { id: string; tier: string }[];
  };
}

/** Coins arrive the only way they can: a task_reward row. */
async function earn(coins: number) {
  await env.DB.prepare(
    "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,'task_reward',?)",
  )
    .bind(crypto.randomUUID(), userId, coins, new Date().toISOString())
    .run();
}

const scalar = async (sql: string, ...binds: unknown[]) =>
  (
    (await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ v: number }>()) as { v: number }
  ).v;

const myBalance = () =>
  scalar("SELECT COALESCE(SUM(amount_coins),0) AS v FROM ledger WHERE user_id = ?", userId);
const myLedgerRows = () => scalar("SELECT COUNT(*) AS v FROM ledger WHERE user_id = ?", userId);
/** Storage is shared by the whole file, so every ledger query is scoped to this user. */
const myRowsFor = (reason: string) =>
  scalar("SELECT COUNT(*) AS v FROM ledger WHERE user_id = ? AND reason = ?", userId, reason);
const holdingsIn = (albumId: string) =>
  scalar(
    `SELECT COUNT(*) AS v FROM holding h JOIN sticker s ON s.id = h.sticker_id WHERE s.album_id = ?`,
    albumId,
  );
const unlockedAt = async (albumId: string) =>
  (
    await env.DB.prepare("SELECT unlocked_at FROM album WHERE id = ?")
      .bind(albumId)
      .first<{ unlocked_at: string | null }>()
  )?.unlocked_at ?? null;

/** Both fields move together: `post` reads the token, `earn` reads the id. */
function switchTo(user: { id: string; token: string }) {
  token = user.token;
  userId = user.id;
}

beforeEach(async () => {
  const user = await makeUser();
  token = user.token;
  userId = user.id;
});

describe("unlocking an album", () => {
  it("charges the unlock price and opens the album", async () => {
    const { album } = await seal();
    await earn(500);

    const response = await post(`/api/albums/${album.id}/unlock`);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ balance: 400, spentCoins: 100 });

    expect(await unlockedAt(album.id)).toBeTruthy();
    expect(await myBalance()).toBe(400);
  });

  it("records the spend against the album", async () => {
    const { album } = await seal();
    await earn(500);
    await post(`/api/albums/${album.id}/unlock`);

    const row = await env.DB.prepare(
      "SELECT amount_coins, reason, album_id FROM ledger WHERE user_id = ? AND reason = 'album_unlock'",
    )
      .bind(userId)
      .first();
    expect(row).toEqual({ amount_coins: -100, reason: "album_unlock", album_id: album.id });
  });

  it("writes NOTHING when the coins are short", async () => {
    // The batch's second statement must not land just because the first matched
    // no rows — that is the §4.3 bug, and this is the assertion that catches it.
    const { album } = await seal();
    await earn(99);

    const response = await post(`/api/albums/${album.id}/unlock`);
    expect(response.status).toBe(402);

    expect(await unlockedAt(album.id)).toBeNull();
    expect(await myBalance()).toBe(99);
    expect(await myLedgerRows()).toBe(1); // the earning row, and nothing else
  });

  it("unlocks a free album rather than treating zero as unaffordable", async () => {
    const { album } = await seal({ unlockPrice: 0 });
    const response = await post(`/api/albums/${album.id}/unlock`);
    expect(response.status).toBe(201);
    expect(await unlockedAt(album.id)).toBeTruthy();
  });

  it("refuses to charge twice for the same album", async () => {
    const { album } = await seal();
    await earn(500);
    expect((await post(`/api/albums/${album.id}/unlock`)).status).toBe(201);

    const second = await post(`/api/albums/${album.id}/unlock`);
    expect(second.status).toBe(409);
    expect(await myBalance()).toBe(400);
  });

  it("charges once when two unlocks race", async () => {
    // Both requests read "locked" before either pays, so the read-then-write
    // check cannot be what protects the balance. The guard folded into the
    // spend's WHERE is: it is evaluated at the moment of payment, inside the
    // same statement that moves the coins.
    const { album } = await seal();
    await earn(250); // enough for two unlocks at 100, if it were charged twice

    const results = await Promise.all([
      post(`/api/albums/${album.id}/unlock`),
      post(`/api/albums/${album.id}/unlock`),
    ]);

    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    expect(await myBalance()).toBe(150);
    expect(await myRowsFor("album_unlock")).toBe(1);
  });

  it("404s another user's album instead of unlocking it", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const { album } = await seal();
    switchTo(me);
    await earn(500);

    expect((await post(`/api/albums/${album.id}/unlock`)).status).toBe(404);
    expect(await unlockedAt(album.id)).toBeNull();
    expect(await myBalance()).toBe(500);
  });

  it("charges once however many times the request is retried", async () => {
    const { album } = await seal();
    await earn(500);
    // A fresh key each run: the mutation table outlives a single vitest process,
    // so a literal string would replay last run's response.
    const retryKey = crypto.randomUUID();

    const first = await post(`/api/albums/${album.id}/unlock`, { "Idempotency-Key": retryKey });
    const second = await post(`/api/albums/${album.id}/unlock`, { "Idempotency-Key": retryKey });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await myBalance()).toBe(400);
    expect(await myRowsFor("album_unlock")).toBe(1);
  });
});

describe("buying a sticker directly", () => {
  async function unlockedAlbum() {
    const sealed = await seal();
    await earn(1000);
    expect((await post(`/api/albums/${sealed.album.id}/unlock`)).status).toBe(201);
    return sealed;
  }

  it("charges the sticker's tier price in this album", async () => {
    const { album, stickers } = await unlockedAlbum();
    const legendary = stickers.find((s) => s.tier === "legendary") as { id: string };

    const response = await post(`/api/albums/${album.id}/stickers/${legendary.id}/buy`);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ spentCoins: 400, quantity: 1 });
    expect(await myBalance()).toBe(1000 - 100 - 400);
  });

  it("prices by tier, not by sticker", async () => {
    const { album, stickers } = await unlockedAlbum();
    const common = stickers.find((s) => s.tier === "common") as { id: string };
    const rare = stickers.find((s) => s.tier === "rare") as { id: string };

    await post(`/api/albums/${album.id}/stickers/${common.id}/buy`);
    await post(`/api/albums/${album.id}/stickers/${rare.id}/buy`);
    expect(await myBalance()).toBe(1000 - 100 - 20 - 50);
  });

  it("grants exactly one copy", async () => {
    const { album, stickers } = await unlockedAlbum();
    const first = stickers[0] as { id: string };
    await post(`/api/albums/${album.id}/stickers/${first.id}/buy`);

    const row = await env.DB.prepare("SELECT quantity FROM holding WHERE sticker_id = ?")
      .bind(first.id)
      .first<{ quantity: number }>();
    expect(row?.quantity).toBe(1);
    expect(await holdingsIn(album.id)).toBe(1);
  });

  it("refuses to sell inside a locked album", async () => {
    // No sticker may be bought until the album itself is unlocked.
    const { album, stickers } = await seal();
    await earn(1000);
    const first = stickers[0] as { id: string };

    const response = await post(`/api/albums/${album.id}/stickers/${first.id}/buy`);
    expect(response.status).toBe(403);
    expect(await holdingsIn(album.id)).toBe(0);
    expect(await myBalance()).toBe(1000);
  });

  it("refuses to sell the same sticker twice", async () => {
    const { album, stickers } = await unlockedAlbum();
    const first = stickers[0] as { id: string };
    await post(`/api/albums/${album.id}/stickers/${first.id}/buy`);
    const before = await myBalance();

    const second = await post(`/api/albums/${album.id}/stickers/${first.id}/buy`);
    expect(second.status).toBe(409);
    expect(await myBalance()).toBe(before);
    expect(await holdingsIn(album.id)).toBe(1);
  });

  it("writes NOTHING when the coins are short", async () => {
    const { album, stickers } = await seal({ unlockPrice: 0 });
    await post(`/api/albums/${album.id}/unlock`);
    await earn(10); // a legendary costs 400
    const legendary = stickers.find((s) => s.tier === "legendary") as { id: string };

    const response = await post(`/api/albums/${album.id}/stickers/${legendary.id}/buy`);
    expect(response.status).toBe(402);
    expect(await holdingsIn(album.id)).toBe(0);
    expect(await myBalance()).toBe(10);
    expect(await myRowsFor("sticker_buy")).toBe(0);
  });

  it("404s a sticker that belongs to another album", async () => {
    const { album } = await unlockedAlbum();
    const other = await seal();
    const foreign = other.stickers[0] as { id: string };

    const response = await post(`/api/albums/${album.id}/stickers/${foreign.id}/buy`);
    expect(response.status).toBe(404);
    expect(await myBalance()).toBe(900);
  });

  it("404s another user's sticker", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await seal();
    await earn(1000);
    // Genuinely unlocked, so a 404 below cannot be a 403 wearing a disguise.
    expect((await post(`/api/albums/${theirs.album.id}/unlock`)).status).toBe(201);
    switchTo(me);
    await earn(1000);

    const first = theirs.stickers[0] as { id: string };
    const response = await post(`/api/albums/${theirs.album.id}/stickers/${first.id}/buy`);
    expect(response.status).toBe(404);
    expect(await holdingsIn(theirs.album.id)).toBe(0);
  });

  it("charges once however many times the request is retried", async () => {
    const { album, stickers } = await unlockedAlbum();
    const first = stickers[0] as { id: string };
    const before = await myBalance();
    const retryKey = crypto.randomUUID();

    await post(`/api/albums/${album.id}/stickers/${first.id}/buy`, { "Idempotency-Key": retryKey });
    await post(`/api/albums/${album.id}/stickers/${first.id}/buy`, { "Idempotency-Key": retryKey });

    expect(await myRowsFor("sticker_buy")).toBe(1);
    expect(await myBalance()).toBe(before - 20);
    expect(await holdingsIn(album.id)).toBe(1);
  });

  it("refuses an unauthenticated purchase", async () => {
    const { album, stickers } = await unlockedAlbum();
    const first = stickers[0] as { id: string };
    const response = await app.fetch(
      new Request(`http://localhost/api/albums/${album.id}/stickers/${first.id}/buy`, {
        method: "POST",
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});

describe("the holding table", () => {
  it("cannot hold the same sticker twice", async () => {
    // The unique index is what makes `quantity` the single source of truth for
    // duplicates. Without it a second pull writes a second row (A-04b).
    const sealed = await seal();
    const first = sealed.stickers[0] as { id: string };
    const now = new Date().toISOString();

    await env.DB.prepare(
      "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,1,?)",
    )
      .bind(crypto.randomUUID(), first.id, now)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,1,?)",
      )
        .bind(crypto.randomUUID(), first.id, now)
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses a quantity below one", async () => {
    const sealed = await seal();
    const first = sealed.stickers[0] as { id: string };
    await expect(
      env.DB.prepare(
        "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,0,?)",
      )
        .bind(crypto.randomUUID(), first.id, new Date().toISOString())
        .run(),
    ).rejects.toThrow();
  });
});
