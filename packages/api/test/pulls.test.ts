import { env } from "cloudflare:test";
import type { CreateAlbumInput, PullResult, SaleResult } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * The random pull and the duplicate sale.
 *
 * The roll is A-01's arithmetic, already proven there; what is tested here is
 * what the roll is allowed to reach, what it costs, and what happens to the
 * ledger and the holding when it fails.
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

async function earn(coins: number) {
  await env.DB.prepare(
    "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,'task_reward',?)",
  )
    .bind(crypto.randomUUID(), userId, coins, new Date().toISOString())
    .run();
}

async function seal(over: Partial<CreateAlbumInput> = {}) {
  const body: CreateAlbumInput = {
    title: "Kitchen heroes",
    description: null,
    coverKey: key(999),
    unlockPrice: 0,
    randomPrice: 40,
    prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
    odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
    stickers: [
      { imageKey: key(1), tier: "common" },
      { imageKey: key(2), tier: "rare" },
      { imageKey: key(3), tier: "epic" },
      { imageKey: key(4), tier: "legendary" },
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

/** Sealed, unlocked and funded — the state every pull test starts from. */
async function playable(over: Partial<CreateAlbumInput> = {}, coins = 10_000) {
  const sealed = await seal(over);
  await earn(coins);
  expect((await post(`/api/albums/${sealed.album.id}/unlock`)).status).toBe(201);
  return sealed;
}

const scalar = async (sql: string, ...binds: unknown[]) =>
  (
    (await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ v: number }>()) as { v: number }
  ).v;

const myBalance = () =>
  scalar("SELECT COALESCE(SUM(amount_coins),0) AS v FROM ledger WHERE user_id = ?", userId);
const myRowsFor = (reason: string) =>
  scalar("SELECT COUNT(*) AS v FROM ledger WHERE user_id = ? AND reason = ?", userId, reason);
const holdingRows = (albumId: string) =>
  scalar(
    "SELECT COUNT(*) AS v FROM holding h JOIN sticker s ON s.id = h.sticker_id WHERE s.album_id = ?",
    albumId,
  );
const quantityOf = async (stickerId: string) =>
  (
    await env.DB.prepare("SELECT quantity FROM holding WHERE sticker_id = ?")
      .bind(stickerId)
      .first<{ quantity: number }>()
  )?.quantity ?? null;

/** Grants a sticker outright, so a test can arrange ownership without pulling. */
async function grant(stickerId: string, quantity = 1) {
  await env.DB.prepare(
    "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
  )
    .bind(crypto.randomUUID(), stickerId, quantity, new Date().toISOString())
    .run();
}

/** Both fields move together: `post` reads the token, `earn` reads the id. */
function switchTo(user: { id: string; token: string }) {
  token = user.token;
  userId = user.id;
}

const pull = async (albumId: string, headers: Record<string, string> = {}) => {
  const response = await post(`/api/albums/${albumId}/pull`, headers);
  return { status: response.status, body: (await response.json()) as PullResult };
};

beforeEach(async () => {
  const user = await makeUser();
  token = user.token;
  userId = user.id;
});

describe("the roll", () => {
  it("charges the album's random price, not the tier's", async () => {
    const { album } = await playable();
    const before = await myBalance();

    const { status, body } = await pull(album.id);
    expect(status).toBe(201);
    expect(body.spentCoins).toBe(40);
    expect(await myBalance()).toBe(before - 40);
  });

  it("costs the same whatever it returns", async () => {
    // Ten stickers, six pulls: the reachable set outlasts the loop, so every
    // response is a real roll rather than a 409 for a finished album.
    const { album } = await playable({
      stickers: Array.from({ length: 10 }, (_, i) => ({
        imageKey: key(i + 1),
        tier: (["common", "rare", "epic", "legendary"] as const)[i % 4] as "common",
      })),
    });
    const spends = new Set<number>();
    for (let i = 0; i < 6; i++) spends.add((await pull(album.id)).body.spentCoins);
    expect([...spends]).toEqual([40]);
  });

  it("returns a sticker from this album", async () => {
    const { album, stickers } = await playable();
    const ids = new Set(stickers.map((s) => s.id));
    const { body } = await pull(album.id);
    expect(ids.has(body.stickerId)).toBe(true);
  });

  it("never returns a sticker from a zero-odds tier", async () => {
    // Those stickers exist and can be bought directly, but the roll can never
    // reach them (§Random 5).
    // Eight commons, so the reachable set is never exhausted mid-loop — with a
    // single common the second pull would (correctly) 409 as complete.
    const { album, stickers } = await playable({
      odds: { common: 100, rare: 0, epic: 0, legendary: 0 },
      stickers: [
        ...Array.from({ length: 8 }, (_, i) => ({ imageKey: key(i + 1), tier: "common" as const })),
        { imageKey: key(50), tier: "rare" as const },
        { imageKey: key(51), tier: "legendary" as const },
      ],
    });
    const unreachable = new Set(stickers.filter((s) => s.tier !== "common").map((s) => s.id));

    for (let i = 0; i < 6; i++) {
      const { body } = await pull(album.id);
      expect(unreachable.has(body.stickerId)).toBe(false);
      expect(body.tier).toBe("common");
    }
  });

  it("can return a sticker already owned — that is what makes duplicates", async () => {
    // A duplicate is only *possible* while some unowned sticker is still
    // reachable; once nothing unowned can come back the pull is refused
    // outright. So: one common, already held, plus rares that keep the album
    // pullable.
    //
    // The rare count matters. With a single rare, one unlucky 1% roll completes
    // the album and every later pull 409s — no duplicate can ever appear, and
    // the test fails 1% of the time. Six rares mean the album can only close
    // after six consecutive 1% rolls, so the loop below fails with probability
    // on the order of 1e-12 rather than 1e-2.
    const { album, stickers } = await playable({
      odds: { common: 99, rare: 1, epic: 0, legendary: 0 },
      stickers: [
        { imageKey: key(1), tier: "common" },
        ...Array.from({ length: 6 }, (_, i) => ({
          imageKey: key(i + 2),
          tier: "rare" as const,
        })),
      ],
    });
    const common = stickers.find((s) => s.tier === "common") as { id: string };
    await grant(common.id);

    const duplicates: number[] = [];
    for (let i = 0; i < 8 && duplicates.length === 0; i++) {
      const { body } = await pull(album.id);
      if (body.stickerId === common.id) duplicates.push(body.quantity);
    }

    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates[0]).toBe(2); // the second copy, not a second row
  });

  it("increments the copy instead of writing a second row", async () => {
    // Five rares, not one — and that is load-bearing. `canPullRandom` needs a
    // tier with odds AND unowned stock, so with a single rare a 1-in-100 first
    // pull could take it, complete the album, and leave the remaining pulls
    // refused with the quantity still at 1. That is a test that fails once every
    // hundred CI runs for no reason anyone can reproduce.
    const { album, stickers } = await playable({
      odds: { common: 99, rare: 1, epic: 0, legendary: 0 },
      stickers: [
        { imageKey: key(1), tier: "common" },
        { imageKey: key(2), tier: "rare" },
        { imageKey: key(3), tier: "rare" },
        { imageKey: key(4), tier: "rare" },
        { imageKey: key(5), tier: "rare" },
        { imageKey: key(6), tier: "rare" },
      ],
    });
    const common = stickers.find((s) => s.tier === "common") as { id: string };
    await grant(common.id);

    for (let i = 0; i < 4; i++) await pull(album.id);

    // However many times the same sticker came back, it is one row.
    expect(await scalar("SELECT COUNT(*) AS v FROM holding WHERE sticker_id = ?", common.id)).toBe(
      1,
    );
    expect((await quantityOf(common.id)) as number).toBeGreaterThan(1);
  });

  it("records the spend as a random_pull against the sticker it returned", async () => {
    const { album } = await playable();
    const { body } = await pull(album.id);

    const row = await env.DB.prepare(
      "SELECT amount_coins, reason, album_id, sticker_id FROM ledger WHERE user_id = ? AND reason = 'random_pull'",
    )
      .bind(userId)
      .first();
    expect(row).toEqual({
      amount_coins: -40,
      reason: "random_pull",
      album_id: album.id,
      sticker_id: body.stickerId,
    });
  });

  it("tells the user what the copy would sell for", async () => {
    const { album } = await playable({ randomPrice: 41 });
    const { body } = await pull(album.id);
    expect(body.refundIfSold).toBe(20); // floored, so a dupe is always a loss
  });
});

describe("when a pull is refused", () => {
  it("409s a complete album", async () => {
    const { album, stickers } = await playable();
    for (const s of stickers) await grant(s.id);

    const response = await post(`/api/albums/${album.id}/pull`);
    expect(response.status).toBe(409);
    expect(await myRowsFor("random_pull")).toBe(0);
  });

  it("409s when every unowned sticker sits in a zero-odds tier", async () => {
    // Not a complete album — reachability is the rule, and completion is only a
    // special case of it. Paying here would buy a guaranteed duplicate.
    const { album, stickers } = await playable({
      odds: { common: 100, rare: 0, epic: 0, legendary: 0 },
    });
    for (const s of stickers.filter((x) => x.tier === "common")) await grant(s.id);

    const response = await post(`/api/albums/${album.id}/pull`);
    expect(response.status).toBe(409);
    expect(await myRowsFor("random_pull")).toBe(0);
    expect(await holdingRows(album.id)).toBe(1); // still incomplete
  });

  it("403s inside a locked album", async () => {
    const sealed = await seal({ unlockPrice: 100 });
    await earn(1000);

    const response = await post(`/api/albums/${sealed.album.id}/pull`);
    expect(response.status).toBe(403);
    expect(await holdingRows(sealed.album.id)).toBe(0);
  });

  it("writes NOTHING when the coins are short", async () => {
    const { album } = await playable({ randomPrice: 500 }, 100);
    const before = await myBalance();

    const response = await post(`/api/albums/${album.id}/pull`);
    expect(response.status).toBe(402);
    expect(await myBalance()).toBe(before);
    expect(await myRowsFor("random_pull")).toBe(0);
    expect(await holdingRows(album.id)).toBe(0);
  });

  it("404s another user's album", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await playable();
    switchTo(me);
    await earn(1000);

    const response = await post(`/api/albums/${theirs.album.id}/pull`);
    expect(response.status).toBe(404);
  });
});

describe("a retried pull", () => {
  it("returns the same sticker instead of gambling twice", async () => {
    // Otherwise a flaky connection turns one paid roll into two.
    const { album } = await playable({
      stickers: [
        { imageKey: key(1), tier: "common" },
        { imageKey: key(2), tier: "common" },
        { imageKey: key(3), tier: "common" },
        { imageKey: key(4), tier: "common" },
      ],
    });
    const retryKey = crypto.randomUUID();
    const before = await myBalance();

    const first = await pull(album.id, { "Idempotency-Key": retryKey });
    const second = await pull(album.id, { "Idempotency-Key": retryKey });

    expect(second.body.stickerId).toBe(first.body.stickerId);
    expect(second.body.quantity).toBe(first.body.quantity);
    expect(await myBalance()).toBe(before - 40);
    expect(await myRowsFor("random_pull")).toBe(1);
    expect(await holdingRows(album.id)).toBe(1);
  });
});

describe("selling a duplicate", () => {
  /**
   * A genuine pull for the ledger row, then the spare copy arranged directly.
   * Rolling until a duplicate lands would make every sale test probabilistic;
   * that a pull *can* produce one is proven above.
   */
  async function withDuplicate(randomPrice = 40) {
    const { album } = await playable({
      randomPrice,
      stickers: [
        { imageKey: key(1), tier: "common" },
        { imageKey: key(2), tier: "common" },
      ],
    });
    const { body } = await pull(album.id);
    await env.DB.prepare("UPDATE holding SET quantity = 2 WHERE sticker_id = ?")
      .bind(body.stickerId)
      .run();
    return { album, stickerId: body.stickerId };
  }

  const sell = async (stickerId: string, headers: Record<string, string> = {}) => {
    const response = await post(`/api/stickers/${stickerId}/sell`, headers);
    return { status: response.status, body: (await response.json()) as SaleResult };
  };

  it("returns half the album's random price", async () => {
    const { stickerId } = await withDuplicate();
    const before = await myBalance();

    const { status, body } = await sell(stickerId);
    expect(status).toBe(201);
    expect(body.refundedCoins).toBe(20);
    expect(await myBalance()).toBe(before + 20);
  });

  it("floors an odd price, so the dupe is still a loss", async () => {
    const { stickerId } = await withDuplicate(41);
    const { body } = await sell(stickerId);
    expect(body.refundedCoins).toBe(20); // not 20.5, and not 21
  });

  it("gives back one copy, not the sticker", async () => {
    const { stickerId } = await withDuplicate();
    const { body } = await sell(stickerId);
    expect(body.quantity).toBe(1);
    expect(await quantityOf(stickerId)).toBe(1);
  });

  it("appends a sale and never edits the pull", async () => {
    // The ledger is append-only by trigger; the sale is a new row beside the
    // pull, which stays exactly as it was.
    const { stickerId } = await withDuplicate();
    const pullRow = await env.DB.prepare(
      "SELECT id, amount_coins FROM ledger WHERE user_id = ? AND reason = 'random_pull' LIMIT 1",
    )
      .bind(userId)
      .first<{ id: string; amount_coins: number }>();

    await sell(stickerId);

    const after = await env.DB.prepare("SELECT amount_coins FROM ledger WHERE id = ?")
      .bind(pullRow?.id)
      .first<{ amount_coins: number }>();
    expect(after?.amount_coins).toBe(pullRow?.amount_coins);
    expect(await myRowsFor("random_pull")).toBe(1);
    expect(await myRowsFor("duplicate_sale")).toBe(1);
  });

  it("refuses to sell the last copy", async () => {
    const { stickerId } = await withDuplicate();
    await sell(stickerId);
    const before = await myBalance();

    const second = await sell(stickerId);
    expect(second.status).toBe(409);
    expect(await myBalance()).toBe(before);
    expect(await quantityOf(stickerId)).toBe(1);
    expect(await myRowsFor("duplicate_sale")).toBe(1);
  });

  it("needs no coins of its own — a credit is not a purchase", async () => {
    const { album, stickerId } = await withDuplicate();
    // Spend the balance down to nothing, then sell.
    const balanceNow = await myBalance();
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,album_id,created_at) VALUES (?,?,?,'sticker_buy',?,?)",
    )
      .bind(crypto.randomUUID(), userId, -balanceNow, album.id, new Date().toISOString())
      .run();
    expect(await myBalance()).toBe(0);

    const { status, body } = await sell(stickerId);
    expect(status).toBe(201);
    expect(body.refundedCoins).toBe(20);
    expect(await myBalance()).toBe(20);
  });

  it("404s a sticker that was never owned", async () => {
    const { stickers } = await playable();
    const unowned = stickers[0] as { id: string };
    const response = await post(`/api/stickers/${unowned.id}/sell`);
    expect(response.status).toBe(404);
  });

  it("404s another user's sticker", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await withDuplicate();
    switchTo(me);

    const response = await post(`/api/stickers/${theirs.stickerId}/sell`);
    expect(response.status).toBe(404);
    expect(await quantityOf(theirs.stickerId)).toBe(2);
  });

  it("refunds once however many times the request is retried", async () => {
    const { stickerId } = await withDuplicate();
    const retryKey = crypto.randomUUID();
    const before = await myBalance();

    await sell(stickerId, { "Idempotency-Key": retryKey });
    await sell(stickerId, { "Idempotency-Key": retryKey });

    expect(await myBalance()).toBe(before + 20);
    expect(await myRowsFor("duplicate_sale")).toBe(1);
    expect(await quantityOf(stickerId)).toBe(1);
  });

  it("refuses an unauthenticated sale", async () => {
    const { stickerId } = await withDuplicate();
    const response = await app.fetch(
      new Request(`http://localhost/api/stickers/${stickerId}/sell`, { method: "POST" }),
      env,
    );
    expect(response.status).toBe(401);
  });
});
