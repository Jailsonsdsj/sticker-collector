import { env } from "cloudflare:test";
import type { AlbumDetail, AlbumSummary, CreateAlbumInput } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * The album listing.
 *
 * Completion is computed on every read, so the tests that matter arrange
 * holdings *directly* and then ask the API what it thinks — if a percentage
 * ever came from a column, inserting a holding without touching `album` would
 * not move it.
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

function switchTo(user: { id: string; token: string }) {
  token = user.token;
  userId = user.id;
}

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

function get(path: string) {
  return app.fetch(
    new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );
}

function post(path: string) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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
    unlockPrice: 100,
    randomPrice: 40,
    prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
    odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
    stickers: Array.from({ length: 4 }, (_, i) => ({
      imageKey: key(i + 1),
      tier: "common" as const,
    })),
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
    stickers: { id: string; tier: string; slotIndex: number }[];
  };
}

/** Ownership arranged directly, so nothing writes to `album` on the way. */
async function grant(stickerId: string, quantity = 1) {
  await env.DB.prepare(
    "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
  )
    .bind(crypto.randomUUID(), stickerId, quantity, new Date().toISOString())
    .run();
}

const list = async (query = "") =>
  (await (await get(`/api/albums${query}`)).json()) as AlbumSummary[];

const one = async (albumId: string) => {
  const all = await list();
  return all.find((a) => a.id === albumId) as AlbumSummary;
};

const completedAt = async (albumId: string) =>
  (
    await env.DB.prepare("SELECT completed_at FROM album WHERE id = ?")
      .bind(albumId)
      .first<{ completed_at: string | null }>()
  )?.completed_at ?? null;

beforeEach(async () => {
  switchTo(await makeUser());
});

describe("completion is computed, never stored", () => {
  it("moves when a holding appears, with no write to the album", async () => {
    const { album, stickers } = await seal();
    expect((await one(album.id)).percent).toBe(0);

    await grant((stickers[0] as { id: string }).id);
    expect((await one(album.id)).percent).toBe(25);

    await grant((stickers[1] as { id: string }).id);
    const summary = await one(album.id);
    expect(summary.percent).toBe(50);
    expect(summary.owned).toBe(2);
    expect(summary.total).toBe(4);
  });

  it("counts a duplicate once — copies do not fill slots", async () => {
    const { album, stickers } = await seal();
    await grant((stickers[0] as { id: string }).id, 7);

    const summary = await one(album.id);
    expect(summary.owned).toBe(1);
    expect(summary.percent).toBe(25);
  });

  it("reports 100 only when every slot is filled", async () => {
    const { album, stickers } = await seal();
    for (const s of stickers.slice(0, 3)) await grant(s.id);
    expect((await one(album.id)).percent).toBe(75);

    await grant((stickers[3] as { id: string }).id);
    expect((await one(album.id)).percent).toBe(100);
  });
});

describe("status", () => {
  it("is locked until the album is unlocked, however full it is", async () => {
    const { album, stickers } = await seal();
    for (const s of stickers) await grant(s.id);

    const summary = await one(album.id);
    expect(summary.status).toBe("locked");
    expect(summary.percent).toBe(100); // full, but not yet bought into
  });

  it("moves from in progress to completed", async () => {
    const { album, stickers } = await seal({ unlockPrice: 0 });
    await post(`/api/albums/${album.id}/unlock`);
    expect((await one(album.id)).status).toBe("in_progress");

    for (const s of stickers) await grant(s.id);
    expect((await one(album.id)).status).toBe("completed");
  });

  it("filters without reordering, and sorts without hiding", async () => {
    const locked = await seal({ title: "Locked one" });
    const open = await seal({ title: "Open one", unlockPrice: 0 });
    await post(`/api/albums/${open.album.id}/unlock`);

    const onlyLocked = await list("?status=locked");
    expect(onlyLocked.map((a) => a.id)).toEqual([locked.album.id]);

    const onlyOpen = await list("?status=in_progress");
    expect(onlyOpen.map((a) => a.id)).toEqual([open.album.id]);

    expect((await list("?sort=title")).length).toBe(2);
  });

  it("rejects an unknown status or sort rather than ignoring it", async () => {
    expect((await get("/api/albums?status=halfway")).status).toBe(400);
    expect((await get("/api/albums?sort=vibes")).status).toBe(400);
  });
});

describe("the two nudges", () => {
  it("flags an album one or two slots from done", async () => {
    const { album, stickers } = await seal({ unlockPrice: 0 });
    await post(`/api/albums/${album.id}/unlock`);

    await grant((stickers[0] as { id: string }).id);
    expect((await one(album.id)).almostThere).toBe(false); // 3 left

    await grant((stickers[1] as { id: string }).id);
    expect((await one(album.id)).almostThere).toBe(true); // 2 left

    await grant((stickers[2] as { id: string }).id);
    expect((await one(album.id)).almostThere).toBe(true); // 1 left

    await grant((stickers[3] as { id: string }).id);
    expect((await one(album.id)).almostThere).toBe(false); // finished
  });

  it("does not nudge about a locked album the user cannot fill yet", async () => {
    const { album, stickers } = await seal();
    for (const s of stickers.slice(0, 3)) await grant(s.id);
    expect((await one(album.id)).almostThere).toBe(false);
  });

  it("marks an album the balance could unlock", async () => {
    const cheap = await seal({ title: "Cheap", unlockPrice: 50 });
    const dear = await seal({ title: "Dear", unlockPrice: 5000 });
    await earn(100);

    const all = await list();
    expect(all.find((a) => a.id === cheap.album.id)?.affordable).toBe(true);
    expect(all.find((a) => a.id === dear.album.id)?.affordable).toBe(false);
  });

  it("never marks an already-unlocked album affordable", async () => {
    const { album } = await seal({ unlockPrice: 0 });
    await post(`/api/albums/${album.id}/unlock`);
    await earn(1000);
    expect((await one(album.id)).affordable).toBe(false);
  });
});

describe("completed_at", () => {
  async function playable() {
    const sealed = await seal({
      unlockPrice: 0,
      prices: { common: 10, rare: 10, epic: 10, legendary: 10 },
    });
    await earn(1000);
    await post(`/api/albums/${sealed.album.id}/unlock`);
    return sealed;
  }

  it("is unset while a slot is still empty", async () => {
    const { album, stickers } = await playable();
    for (const s of stickers.slice(0, 3)) {
      expect((await post(`/api/albums/${album.id}/stickers/${s.id}/buy`)).status).toBe(201);
    }
    expect(await completedAt(album.id)).toBeNull();
  });

  it("is stamped by the purchase that fills the last slot", async () => {
    const { album, stickers } = await playable();
    for (const s of stickers) {
      expect((await post(`/api/albums/${album.id}/stickers/${s.id}/buy`)).status).toBe(201);
    }
    expect(await completedAt(album.id)).toBeTruthy();
    expect((await one(album.id)).status).toBe("completed");
  });

  it("is stamped by a pull that fills the last slot", async () => {
    // Completion must not depend on which of the two paths delivered the sticker.
    const { album, stickers } = await playable();
    for (const s of stickers.slice(0, 3))
      await post(`/api/albums/${album.id}/stickers/${s.id}/buy`);
    expect(await completedAt(album.id)).toBeNull();

    // An owned sticker stays eligible, so most of these rolls come back as
    // duplicates — which is exactly how the last slot feels to play. The pull
    // starts refusing (409) the moment the album is complete, and that is what
    // ends the loop. A single pull here would pass 25% of the time.
    await earn(10_000); // 40 pulls at 40 coins: never let this end in a 402
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) {
      const status = (await post(`/api/albums/${album.id}/pull`)).status;
      expect([201, 409]).toContain(status); // a 402 here would be a funding bug
      refused = status === 409;
    }

    expect(refused).toBe(true);
    expect(await completedAt(album.id)).toBeTruthy();
  });

  it("never moves once set", async () => {
    // Sell a duplicate and buy back in: the album was finished at a moment in
    // history, and that moment is not rewritten.
    const { album, stickers } = await playable();
    for (const s of stickers) await post(`/api/albums/${album.id}/stickers/${s.id}/buy`);
    const firstStamp = await completedAt(album.id);
    expect(firstStamp).toBeTruthy();

    const target = stickers[0] as { id: string };
    await env.DB.prepare("UPDATE holding SET quantity = 2 WHERE sticker_id = ?")
      .bind(target.id)
      .run();
    expect((await post(`/api/stickers/${target.id}/sell`)).status).toBe(201);
    expect((await post(`/api/albums/${album.id}/pull`)).status).toBe(409); // still complete

    expect(await completedAt(album.id)).toBe(firstStamp);
  });

  it("is not stamped by a purchase that leaves the album unfinished", async () => {
    const { album, stickers } = await playable();
    await post(`/api/albums/${album.id}/stickers/${(stickers[0] as { id: string }).id}/buy`);
    expect(await completedAt(album.id)).toBeNull();
  });
});

describe("one album in detail", () => {
  it("returns every slot in order, empty ones included", async () => {
    // A locked slot still has to render its rarity frame, so it cannot be
    // omitted just because it is unowned.
    const { album, stickers } = await seal();
    await grant((stickers[0] as { id: string }).id, 3);

    const detail = (await (await get(`/api/albums/${album.id}`)).json()) as AlbumDetail;

    expect(detail.stickers).toHaveLength(4);
    expect(detail.stickers.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3]);

    const owned = detail.stickers.find((s) => s.id === (stickers[0] as { id: string }).id);
    expect(owned?.quantity).toBe(3);
    expect(detail.stickers.filter((s) => s.quantity === 0)).toHaveLength(3);
  });

  it("carries the same computed summary as the listing", async () => {
    const { album, stickers } = await seal();
    await grant((stickers[0] as { id: string }).id);

    const detail = (await (await get(`/api/albums/${album.id}`)).json()) as AlbumDetail;
    expect(detail.album.percent).toBe(25);
    expect(detail.album.status).toBe("locked");
  });

  it("lets a locked album be browsed", async () => {
    const { album } = await seal();
    const response = await get(`/api/albums/${album.id}`);
    expect(response.status).toBe(200);
  });

  it("404s an unknown album", async () => {
    expect((await get(`/api/albums/${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("isolation", () => {
  it("lists only this user's albums", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await seal({ title: "Not mine" });
    switchTo(me);
    const mine = await seal({ title: "Mine" });

    const all = await list();
    expect(all.map((a) => a.id)).toEqual([mine.album.id]);
    expect(all.some((a) => a.id === theirs.album.id)).toBe(false);
  });

  it("404s another user's album detail", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await seal();
    switchTo(me);

    expect((await get(`/api/albums/${theirs.album.id}`)).status).toBe(404);
  });

  it("refuses an unauthenticated listing", async () => {
    const response = await app.fetch(new Request("http://localhost/api/albums"), env);
    expect(response.status).toBe(401);
  });
});

describe("deleting an album", () => {
  const del = (albumId: string) =>
    app.fetch(
      new Request(`http://localhost/api/albums/${albumId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );

  const ledgerRows = () =>
    env.DB.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(amount_coins),0) AS total FROM ledger WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ n: number; total: number }>();

  async function spentInto() {
    const sealed = await seal({ unlockPrice: 100 });
    await earn(1000);
    expect((await post(`/api/albums/${sealed.album.id}/unlock`)).status).toBe(201);
    const first = sealed.stickers[0] as { id: string };
    expect((await post(`/api/albums/${sealed.album.id}/stickers/${first.id}/buy`)).status).toBe(
      201,
    );
    return sealed;
  }

  it("keeps every coin spent, and every ledger row", async () => {
    // The reason the delete is soft: those rows are foreign-keyed to the album
    // and the ledger is append-only, so they can neither move nor be removed.
    // Nothing is refunded either — that is the spec, not an accident.
    const sealed = await spentInto();
    const before = await ledgerRows();

    expect((await del(sealed.album.id)).status).toBe(200);

    expect(await ledgerRows()).toEqual(before);
  });

  it("takes the album out of the listing", async () => {
    const sealed = await seal();
    expect((await list()).some((a) => a.id === sealed.album.id)).toBe(true);

    await del(sealed.album.id);
    expect((await list()).some((a) => a.id === sealed.album.id)).toBe(false);
  });

  it("stops the album being opened", async () => {
    const sealed = await seal();
    await del(sealed.album.id);
    expect((await get(`/api/albums/${sealed.album.id}`)).status).toBe(404);
  });

  it("closes every way of spending inside it", async () => {
    // Missing one of these would leave coins spendable inside something the
    // user believes is gone.
    const sealed = await spentInto();
    const spare = sealed.stickers[1] as { id: string };
    await del(sealed.album.id);

    expect((await post(`/api/albums/${sealed.album.id}/unlock`)).status).toBe(404);
    expect((await post(`/api/albums/${sealed.album.id}/stickers/${spare.id}/buy`)).status).toBe(
      404,
    );
    expect((await post(`/api/albums/${sealed.album.id}/pull`)).status).toBe(404);
  });

  it("cannot be used as the source of a new edition", async () => {
    const sealed = await seal();
    await del(sealed.album.id);

    const response = await app.fetch(
      new Request("http://localhost/api/albums", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: "Second edition",
          coverKey: key(999),
          unlockPrice: 0,
          randomPrice: 1,
          prices: { common: 1, rare: 1, epic: 1, legendary: 1 },
          odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
          stickers: [{ imageKey: key(1), tier: "common" }],
          derivedFromAlbumId: sealed.album.id,
        }),
      }),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("is not an error the second time", async () => {
    const sealed = await seal();
    expect((await del(sealed.album.id)).status).toBe(200);
    expect((await del(sealed.album.id)).status).toBe(404);
  });

  it("leaves another user's album alone", async () => {
    const me = { id: userId, token };
    switchTo(await makeUser());
    const theirs = await seal();
    switchTo(me);

    expect((await del(theirs.album.id)).status).toBe(404);

    // Untouched, not merely unreachable.
    const row = await env.DB.prepare("SELECT deleted_at FROM album WHERE id = ?")
      .bind(theirs.album.id)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeNull();
  });

  it("refuses an unauthenticated delete", async () => {
    const sealed = await seal();
    const response = await app.fetch(
      new Request(`http://localhost/api/albums/${sealed.album.id}`, { method: "DELETE" }),
      env,
    );
    expect(response.status).toBe(401);
    expect((await get(`/api/albums/${sealed.album.id}`)).status).toBe(200);
  });
});

describe("the order a grid and a printed sheet share", () => {
  it("groups by rarity, commonest first", async () => {
    // Supersedes the shuffle §Creating 10 used to describe. One order, so the
    // printed sheet matches the screen.
    const { album } = await seal({
      stickers: [
        { imageKey: key(1), tier: "legendary" },
        { imageKey: key(2), tier: "common" },
        { imageKey: key(3), tier: "epic" },
        { imageKey: key(4), tier: "rare" },
        { imageKey: key(5), tier: "common" },
      ],
    });

    const detail = (await (await get(`/api/albums/${album.id}`)).json()) as AlbumDetail;

    expect(detail.stickers.map((s) => s.tier)).toEqual([
      "common",
      "common",
      "rare",
      "epic",
      "legendary",
    ]);
  });

  it("keeps the stored slot order as the tie-break inside a tier", async () => {
    // The shuffle is still drawn once and stored; it is no longer what the
    // album is laid out by, but it is what makes the order deterministic.
    const { album } = await seal({
      stickers: Array.from({ length: 6 }, (_, i) => ({
        imageKey: key(i + 1),
        tier: "common" as const,
      })),
    });

    const detail = (await (await get(`/api/albums/${album.id}`)).json()) as AlbumDetail;
    const slots = detail.stickers.map((s) => s.slotIndex);

    expect(slots).toEqual([...slots].sort((a, b) => a - b));
  });
});
