import { env } from "cloudflare:test";
import { ALBUM_MAX_STICKERS, type CreateAlbumInput, DEFAULT_ODDS } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

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

const stickers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    imageKey: key(i + 1),
    tier: (["common", "rare", "epic", "legendary"] as const)[i % 4] as "common",
  }));

function album(over: Partial<CreateAlbumInput> = {}): CreateAlbumInput {
  return {
    title: "Kitchen heroes",
    description: null,
    coverKey: key(999),
    unlockPrice: 500,
    randomPrice: 40,
    prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
    odds: DEFAULT_ODDS,
    stickers: stickers(12),
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request("http://localhost/api/albums", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify(body),
    }),
    env,
  );
}

async function create(over: Partial<CreateAlbumInput> = {}) {
  const response = await post(album(over));
  expect(response.status).toBe(201);
  return (await response.json()) as {
    album: { id: string; sealedAt: string; unlockedAt: string | null; editionNumber: number };
    stickers: { id: string; slotIndex: number; tier: string; imageKey: string }[];
  };
}

/**
 * Storage is shared by every test in this file, so a bare COUNT(*) counts other
 * tests' rows. Each of these is scoped to the user created in `beforeEach`.
 */
const myAlbums = () => count("SELECT COUNT(*) AS n FROM album WHERE user_id = ?", userId);
const myStickers = () =>
  count(
    "SELECT COUNT(*) AS n FROM sticker s JOIN album a ON a.id = s.album_id WHERE a.user_id = ?",
    userId,
  );

const count = async (sql: string, ...binds: unknown[]) =>
  (
    (await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ n: number }>()) as { n: number }
  ).n;

beforeEach(async () => {
  const user = await makeUser();
  token = user.token;
  userId = user.id;
});

describe("sealing", () => {
  it("writes the album and every sticker", async () => {
    const created = await create();

    expect(created.stickers).toHaveLength(12);
    expect(await count("SELECT COUNT(*) AS n FROM album WHERE id = ?", created.album.id)).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM sticker WHERE album_id = ?", created.album.id),
    ).toBe(12);
  });

  it("seals on creation — there is no unsealed state to catch", async () => {
    const created = await create();
    expect(created.album.sealedAt).toBeTruthy();

    const row = await env.DB.prepare("SELECT sealed_at FROM album WHERE id = ?")
      .bind(created.album.id)
      .first<{ sealed_at: string | null }>();
    expect(row?.sealed_at).toBeTruthy();
  });

  it("arrives locked and incomplete", async () => {
    const created = await create();
    expect(created.album.unlockedAt).toBeNull();

    const row = await env.DB.prepare("SELECT unlocked_at, completed_at FROM album WHERE id = ?")
      .bind(created.album.id)
      .first<{ unlocked_at: string | null; completed_at: string | null }>();
    expect(row).toEqual({ unlocked_at: null, completed_at: null });
  });

  it("freezes the ten economic numbers exactly as submitted", async () => {
    const created = await create({ unlockPrice: 777, randomPrice: 33, odds: DEFAULT_ODDS });
    const row = await env.DB.prepare(
      "SELECT unlock_price, random_price, price_common, price_legendary, odds_common, odds_legendary FROM album WHERE id = ?",
    )
      .bind(created.album.id)
      .first();
    expect(row).toEqual({
      unlock_price: 777,
      random_price: 33,
      price_common: 20,
      price_legendary: 400,
      odds_common: 60,
      odds_legendary: 3,
    });
  });

  it("writes no album when a later statement in the batch fails", async () => {
    // The album row is written by the first statement and the stickers by the
    // second. Making the second fail is the only way to show the batch is what
    // holds them together — D1 has no interactive transaction to unwind by hand,
    // so without the batch this would leave an album with no stickers, which is
    // unsealable and uneditable thanks to `sticker_frozen`.
    await env.DB.prepare("DROP TRIGGER IF EXISTS reject_legendary").run();
    await env.DB.prepare(
      `CREATE TRIGGER reject_legendary BEFORE INSERT ON sticker
       WHEN new.tier = 'legendary'
       BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
    ).run();

    try {
      const response = await post(album({ stickers: stickers(4) })); // the 4th is legendary
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(await myAlbums()).toBe(0);
      expect(await myStickers()).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS reject_legendary").run();
    }
  });
});

describe("slot order", () => {
  it("is a permutation — every slot filled once", async () => {
    const created = await create({ stickers: stickers(24) });
    const slots = created.stickers.map((s) => s.slotIndex).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it("is stored, not derived at read time", async () => {
    const created = await create();
    const rows = await env.DB.prepare(
      "SELECT slot_index FROM sticker WHERE album_id = ? ORDER BY slot_index",
    )
      .bind(created.album.id)
      .all<{ slot_index: number }>();
    expect(rows.results.map((r) => r.slot_index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("seals an album at the documented maximum", async () => {
    // D1 binds at most 100 parameters per statement and a sticker row binds 5,
    // so a single INSERT silently caps an album at 20 and 500s on the 21st.
    // Anything below that number tests nothing about the limit.
    const created = await create({ stickers: stickers(ALBUM_MAX_STICKERS) });
    expect(created.stickers).toHaveLength(ALBUM_MAX_STICKERS);
    expect(await myStickers()).toBe(ALBUM_MAX_STICKERS);

    const slots = created.stickers.map((s) => s.slotIndex).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: ALBUM_MAX_STICKERS }, (_, i) => i));
  });

  it("seals an album one sticker past a chunk boundary", async () => {
    const created = await create({ stickers: stickers(21) });
    expect(created.stickers).toHaveLength(21);
    expect(await myStickers()).toBe(21);
  });

  it("shuffles rather than keeping the submitted order", async () => {
    // Tiers are submitted in a repeating cycle, so an unshuffled album would put
    // every legendary in the same place in every album.
    const albums = await Promise.all([create(), create(), create(), create(), create()]);
    const submitted = stickers(12).map((s) => s.imageKey);
    const shuffled = albums.some((created) => {
      const bySlot = [...created.stickers].sort((a, b) => a.slotIndex - b.slotIndex);
      return bySlot.map((s) => s.imageKey).join() !== submitted.join();
    });
    expect(shuffled).toBe(true);
  });
});

describe("what the seal refuses", () => {
  const rejects = async (over: Partial<CreateAlbumInput>) => {
    const response = await post(album(over));
    expect(response.status).toBe(400);
    expect(await myAlbums()).toBe(0);
  };

  it("rejects odds that do not sum to 100", () =>
    rejects({ odds: { common: 60, rare: 25, epic: 12, legendary: 2 } }));

  it("rejects odds that rise towards the rarer tiers", () =>
    rejects({ odds: { common: 25, rare: 60, epic: 12, legendary: 3 } }));

  it("accepts a zero-odds tier — its stickers can still be bought directly", async () => {
    const created = await create({ odds: { common: 70, rare: 30, epic: 0, legendary: 0 } });
    expect(created.album.editionNumber).toBe(1);
  });

  it("rejects an album with no stickers", () => rejects({ stickers: [] }));

  it("rejects more stickers than one batch should carry", () =>
    rejects({ stickers: stickers(ALBUM_MAX_STICKERS + 1) }));

  it("rejects an image key that is not a content address", () =>
    rejects({ stickers: [{ imageKey: "img/../escape.jpg", tier: "common" }] }));

  it("rejects a cover that is not a content address", () => rejects({ coverKey: "cover.jpg" }));

  it("rejects a free random pull, which would make a duplicate cost nothing", () =>
    rejects({ randomPrice: 0 }));

  it("rejects unknown fields rather than silently dropping them", async () => {
    const response = await post({ ...album(), sealedAt: "2020-01-01T00:00:00Z" });
    expect(response.status).toBe(400);
  });

  it("refuses an unauthenticated request", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/albums", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(album()),
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});

describe("the triggers — enforced by the database, not by this code", () => {
  it("rejects a change to a sealed album's economics", async () => {
    const created = await create();
    for (const [column, value] of [
      ["unlock_price", 1],
      ["random_price", 1],
      ["price_common", 1],
      ["odds_legendary", 50],
    ] as const) {
      await expect(
        env.DB.prepare(`UPDATE album SET ${column} = ? WHERE id = ?`)
          .bind(value, created.album.id)
          .run(),
      ).rejects.toThrow(/sealed album economics are immutable/);
    }
  });

  it("rejects any update to a sticker row", async () => {
    const created = await create();
    const first = created.stickers[0] as { id: string };
    await expect(
      env.DB.prepare("UPDATE sticker SET tier = 'legendary' WHERE id = ?").bind(first.id).run(),
    ).rejects.toThrow(/sticker rows are immutable/);
    await expect(
      env.DB.prepare("UPDATE sticker SET slot_index = 99 WHERE id = ?").bind(first.id).run(),
    ).rejects.toThrow(/sticker rows are immutable/);
  });

  it("still allows the non-economic columns to move, or nothing could be unlocked", async () => {
    // An over-broad trigger would be just as wrong: A-04 has to set unlocked_at,
    // and A-05 has to set completed_at.
    const created = await create();
    await env.DB.prepare("UPDATE album SET unlocked_at = ? WHERE id = ?")
      .bind("2026-07-28T00:00:00Z", created.album.id)
      .run();
    await env.DB.prepare("UPDATE album SET completed_at = ? WHERE id = ?")
      .bind("2026-07-29T00:00:00Z", created.album.id)
      .run();

    const row = await env.DB.prepare("SELECT unlocked_at, completed_at FROM album WHERE id = ?")
      .bind(created.album.id)
      .first<{ unlocked_at: string; completed_at: string }>();
    expect(row?.unlocked_at).toBe("2026-07-28T00:00:00Z");
    expect(row?.completed_at).toBe("2026-07-29T00:00:00Z");
  });

  it("rejects odds that do not sum to 100 even when inserted directly", async () => {
    // The CHECK is the backstop for anything that never passes through Zod.
    await expect(
      env.DB.prepare(
        `INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
           price_common,price_rare,price_epic,price_legendary,
           odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          crypto.randomUUID(),
          userId,
          "Bad",
          key(1),
          0,
          1,
          1,
          1,
          1,
          1,
          60,
          25,
          12,
          99,
          "2026-07-28T00:00:00Z",
          "2026-07-28T00:00:00Z",
        )
        .run(),
    ).rejects.toThrow();
  });
});

describe("a new edition of an existing album", () => {
  it("continues the chain and leaves the source untouched", async () => {
    const source = await create();
    const edition = await create({
      derivedFromAlbumId: source.album.id,
      stickers: source.stickers.map((s) => ({ imageKey: s.imageKey, tier: "common" as const })),
    });

    expect(edition.album.editionNumber).toBe(2);
    expect(edition.album.id).not.toBe(source.album.id);

    const sourceStickers = await count(
      "SELECT COUNT(*) AS n FROM sticker WHERE album_id = ?",
      source.album.id,
    );
    expect(sourceStickers).toBe(12);
  });

  it("reuses the image keys, so no bytes are uploaded", async () => {
    const source = await create();
    const edition = await create({
      derivedFromAlbumId: source.album.id,
      stickers: source.stickers.map((s) => ({ imageKey: s.imageKey, tier: "rare" as const })),
    });

    expect(edition.stickers.map((s) => s.imageKey).sort()).toEqual(
      source.stickers.map((s) => s.imageKey).sort(),
    );
    // Different rows, same content addresses.
    expect(edition.stickers.map((s) => s.id).sort()).not.toEqual(
      source.stickers.map((s) => s.id).sort(),
    );
  });

  it("carries no ownership — every sticker starts locked", async () => {
    const source = await create();
    const first = source.stickers[0] as { id: string };
    await env.DB.prepare(
      "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES (?,?,?,?)",
    )
      .bind(crypto.randomUUID(), first.id, 1, "2026-07-28T00:00:00Z")
      .run();

    const edition = await create({
      derivedFromAlbumId: source.album.id,
      stickers: source.stickers.map((s) => ({ imageKey: s.imageKey, tier: "common" as const })),
    });

    const held = await count(
      `SELECT COUNT(*) AS n FROM holding h JOIN sticker s ON s.id = h.sticker_id
       WHERE s.album_id = ?`,
      edition.album.id,
    );
    expect(held).toBe(0);
  });

  it("cannot derive from another user's album", async () => {
    // The schema is multi-user even though the product is not, and an id is
    // guessable in a way a session is not. Deriving reads the source's edition
    // number, so an unscoped lookup would leak that another album exists.
    const mine = await create();
    const myToken = token;
    const stranger = await makeUser();
    token = stranger.token;
    const theirs = await create();
    token = myToken;

    const response = await post(album({ derivedFromAlbumId: theirs.album.id }));
    expect(response.status).toBe(404);
    expect(mine.album.editionNumber).toBe(1);
  });

  it("404s an unknown source rather than silently starting a new chain", async () => {
    const response = await post(album({ derivedFromAlbumId: crypto.randomUUID() }));
    expect(response.status).toBe(404);
  });
});

describe("idempotency", () => {
  it("creates one album however many times the request is retried", async () => {
    const body = album();
    const first = await post(body, { "Idempotency-Key": "seal-1" });
    expect(first.status).toBe(201);
    const created = (await first.json()) as { album: { id: string } };

    const second = await post(body, { "Idempotency-Key": "seal-1" });
    expect(second.status).toBe(201);
    const replayed = (await second.json()) as { album: { id: string } };

    expect(replayed.album.id).toBe(created.album.id);
    expect(await myAlbums()).toBe(1);
    expect(await myStickers()).toBe(12);
  });
});

describe("hiding locked slots and a sticker's own words", () => {
  it("stores them with the album", async () => {
    const created = await post({
      ...album(),
      hideLocked: true,
      lockedCoverKey: key(9),
      stickers: [{ imageKey: key(1), tier: "common", title: "Red Fox", description: "A note" }],
    });
    expect(created.status).toBe(201);

    const row = await env.DB.prepare(
      "SELECT hide_locked, locked_cover_key FROM album ORDER BY rowid DESC LIMIT 1",
    ).first<{ hide_locked: number; locked_cover_key: string | null }>();
    // D1 has no boolean: the column is 0/1 and the API speaks true/false.
    expect(row).toMatchObject({ hide_locked: 1, locked_cover_key: key(9) });

    const sticker = await env.DB.prepare(
      "SELECT title, description FROM sticker ORDER BY rowid DESC LIMIT 1",
    ).first<{ title: string | null; description: string | null }>();
    expect(sticker).toMatchObject({ title: "Red Fox", description: "A note" });
  });

  it("defaults to showing everything, with no words", async () => {
    const created = await post(album());
    expect(created.status).toBe(201);

    const row = await env.DB.prepare(
      "SELECT hide_locked, locked_cover_key FROM album ORDER BY rowid DESC LIMIT 1",
    ).first<{ hide_locked: number; locked_cover_key: string | null }>();
    expect(row).toMatchObject({ hide_locked: 0, locked_cover_key: null });
  });

  it("refuses a locked cover with nothing hidden", async () => {
    // The album is immutable once sealed, so two fields that disagree would
    // disagree forever.
    const response = await post({
      ...album(),
      hideLocked: false,
      lockedCoverKey: key(9),
    });
    expect(response.status).toBe(400);
  });

  it("reads them back on the detail route", async () => {
    const created = await post({
      ...album(),
      hideLocked: true,
      lockedCoverKey: key(9),
      stickers: [{ imageKey: key(1), tier: "common", title: "Red Fox", description: "A note" }],
    });
    // Sealing returns the whole album, not a bare id.
    const { album: sealed } = (await created.json()) as { album: { id: string } };

    const raw = await app.fetch(
      new Request(`http://localhost/api/albums/${sealed.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    const detail = (await raw.json()) as {
      album: { hideLocked: boolean; lockedCoverKey: string | null };
      stickers: { title: string | null; description: string | null }[];
    };

    expect(detail.album.hideLocked).toBe(true);
    expect(detail.album.lockedCoverKey).toBe(key(9));
    expect(detail.stickers[0]).toMatchObject({ title: "Red Fox", description: "A note" });
  });

  it("still seals an album larger than one INSERT can carry", async () => {
    // A sticker row now binds SEVEN parameters against D1's 100-per-statement
    // limit, so the chunk size had to drop from 20 to 14. Getting that wrong
    // caps an album silently and 500s on the row after the cap (TD-15).
    const stickers = Array.from({ length: 40 }, (_, i) => ({
      imageKey: key(i + 1),
      tier: "common" as const,
      title: `Sticker ${i}`,
      description: "A reasonably long note to make the row bind its full width",
    }));

    const created = await post({ ...album(), stickers });
    expect(created.status).toBe(201);

    // Sealing returns the whole album, not a bare id.
    const { album: sealed } = (await created.json()) as { album: { id: string } };
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM sticker WHERE album_id = ?")
      .bind(sealed.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(40);
  });
});
