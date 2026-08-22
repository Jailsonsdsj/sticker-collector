import { env } from "cloudflare:test";
import type { CreatePuzzleInput, PuzzleDetail, PuzzlePurchase } from "@sticker-collector/shared";
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

function body(over: Partial<CreatePuzzleInput> = {}): CreatePuzzleInput {
  return {
    title: "The harbour",
    description: null,
    imageKey: key(1),
    imageWidth: 1536,
    imageHeight: 1024,
    unlockPrice: 300,
    piecePrice: 25,
    pieces: 48,
    ...over,
  };
}

const call = (method: string, path: string, payload?: unknown) =>
  app.fetch(
    new Request(`http://x${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(method === "GET" ? {} : { "idempotency-key": crypto.randomUUID() }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    env,
  );

async function create(over: Partial<CreatePuzzleInput> = {}) {
  const res = await call("POST", "/api/puzzles", body(over));
  expect(res.status).toBe(201);
  return (await res.json()) as PuzzleDetail;
}

beforeEach(async () => {
  const u = await makeUser();
  userId = u.id;
  token = u.token;
});

describe("creating a puzzle", () => {
  it("stores the grid, not the count the author picked", () => {
    // The board reads rows and cols. Deriving them at read time would mean a
    // change to `gridFor` could re-cut a puzzle that already has pieces bought.
    return create({ pieces: 48 }).then((made) => {
      expect(made).toMatchObject({ rows: 6, cols: 8, ownedCount: 0 });
    });
  });

  it("seals it on the way in", async () => {
    // There is no seal step and there cannot be one: `puzzle_frozen` blocks
    // every change to the economics from the moment `sealed_at` is set.
    const made = await create();
    expect(made.sealedAt).toEqual(expect.any(String));
    expect(made.unlockedAt).toBeNull();
    expect(made.completedAt).toBeNull();
  });

  it("owns no pieces yet, and writes no rows to say so", async () => {
    // Absence of a row IS locked. Seeding 48 rows meaning "not bought" would be
    // the same fact stored twice.
    const made = await create();
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM puzzle_piece WHERE puzzle_id = ?")
      .bind(made.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("refuses a piece count that is not on offer", async () => {
    // 50 is not factorable into a sane grid, which is the whole reason the
    // counts are presets.
    const res = await call("POST", "/api/puzzles", { ...body(), pieces: 50 });
    expect(res.status).toBe(400);
  });

  it("refuses an image key that is not a content address", async () => {
    const res = await call("POST", "/api/puzzles", { ...body(), imageKey: "not-a-key" });
    expect(res.status).toBe(400);
  });

  it("carries the hide-locked choice through", async () => {
    const made = await create({ hideLocked: true });
    expect(made.hideLocked).toBe(true);
  });
});

describe("a sealed puzzle is immutable", () => {
  it("refuses a new piece price", async () => {
    // The trigger, not the route. A price rewritten after pieces were bought
    // would make the ledger disagree with what the board charges.
    const made = await create();
    await expect(
      env.DB.prepare("UPDATE puzzle SET piece_price = 1 WHERE id = ?").bind(made.id).run(),
    ).rejects.toThrow(/immutable/);
  });

  it("refuses a re-cut grid", async () => {
    const made = await create();
    await expect(
      env.DB.prepare("UPDATE puzzle SET cols = 99 WHERE id = ?").bind(made.id).run(),
    ).rejects.toThrow(/immutable/);
  });

  it("still lets it be unlocked, completed and deleted", async () => {
    // The three things that MUST keep moving, or the puzzle could never be
    // played at all.
    const made = await create();
    await env.DB.prepare(
      "UPDATE puzzle SET unlocked_at = ?, completed_at = ?, deleted_at = ? WHERE id = ?",
    )
      .bind("2026-08-21T00:00:00Z", "2026-08-21T00:00:00Z", null, made.id)
      .run();
    const row = await env.DB.prepare("SELECT unlocked_at FROM puzzle WHERE id = ?")
      .bind(made.id)
      .first<{ unlocked_at: string }>();
    expect(row?.unlocked_at).toBe("2026-08-21T00:00:00Z");
  });

  it("refuses to revise a piece that is already owned", async () => {
    const made = await create();
    await env.DB.prepare(
      "INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at) VALUES (?,?,?,?)",
    )
      .bind(crypto.randomUUID(), made.id, 0, "2026-08-21T00:00:00Z")
      .run();

    await expect(
      env.DB.prepare("UPDATE puzzle_piece SET piece_index = 1 WHERE puzzle_id = ?")
        .bind(made.id)
        .run(),
    ).rejects.toThrow(/immutable/);
  });

  it("cannot own the same piece twice", async () => {
    // A second purchase of one piece would take the coins and grant nothing.
    // Impossible at the database, not merely unlikely in the route.
    const made = await create();
    const insert = () =>
      env.DB.prepare(
        "INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at) VALUES (?,?,?,?)",
      )
        .bind(crypto.randomUUID(), made.id, 3, "2026-08-21T00:00:00Z")
        .run();

    await insert();
    await expect(insert()).rejects.toThrow();
  });
});

describe("reading them back", () => {
  it("lists them with how many pieces are owned", async () => {
    const made = await create();
    await env.DB.prepare(
      "INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at) VALUES (?,?,?,?)",
    )
      .bind(crypto.randomUUID(), made.id, 5, "2026-08-21T00:00:00Z")
      .run();

    const list = (await (await call("GET", "/api/puzzles")).json()) as PuzzleDetail[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: made.id, ownedCount: 1 });
  });

  it("gives the board the owned indexes, in order", async () => {
    const made = await create();
    for (const index of [7, 2]) {
      await env.DB.prepare(
        "INSERT INTO puzzle_piece (id, puzzle_id, piece_index, acquired_at) VALUES (?,?,?,?)",
      )
        .bind(crypto.randomUUID(), made.id, index, "2026-08-21T00:00:00Z")
        .run();
    }

    const detail = (await (await call("GET", `/api/puzzles/${made.id}`)).json()) as PuzzleDetail;
    expect(detail.ownedPieces).toEqual([2, 7]);
    expect(detail.ownedCount).toBe(2);
  });

  it("404s a puzzle that is not yours", async () => {
    const made = await create();
    const other = await makeUser();
    token = other.token;

    expect((await call("GET", `/api/puzzles/${made.id}`)).status).toBe(404);
  });
});

describe("deleting one", () => {
  it("is soft, because the ledger points at it and cannot be rewritten", async () => {
    const made = await create();

    expect((await call("DELETE", `/api/puzzles/${made.id}`)).status).toBe(200);

    const row = await env.DB.prepare("SELECT deleted_at FROM puzzle WHERE id = ?")
      .bind(made.id)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toEqual(expect.any(String));
  });

  it("drops it out of the listing and the board", async () => {
    const made = await create();
    await call("DELETE", `/api/puzzles/${made.id}`);

    expect(await (await call("GET", "/api/puzzles")).json()).toEqual([]);
    expect((await call("GET", `/api/puzzles/${made.id}`)).status).toBe(404);
  });

  it("404s a second delete rather than reporting a success", async () => {
    const made = await create();
    await call("DELETE", `/api/puzzles/${made.id}`);

    expect((await call("DELETE", `/api/puzzles/${made.id}`)).status).toBe(404);
  });
});

describe("the ledger can point at a puzzle", () => {
  it("accepts the two new reasons", async () => {
    // The column has no CHECK, so this proves the foreign key and the column
    // exist — the half a migration can get wrong.
    const made = await create();
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,puzzle_id,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), userId, -300, "puzzle_unlock", made.id, "2026-08-21T00:00:00Z")
      .run();

    const row = await env.DB.prepare("SELECT reason FROM ledger WHERE puzzle_id = ?")
      .bind(made.id)
      .first<{ reason: string }>();
    expect(row?.reason).toBe("puzzle_unlock");
  });

  it("refuses a spend pointing at a puzzle that does not exist", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO ledger (id,user_id,amount_coins,reason,puzzle_id,created_at) VALUES (?,?,?,?,?,?)",
      )
        .bind(crypto.randomUUID(), userId, -1, "piece_unlock", "nope", "2026-08-21T00:00:00Z")
        .run(),
    ).rejects.toThrow();
  });
});

describe("buying into a puzzle", () => {
  /** Coins to spend. A credit, never `spend()` — its balance guard is right
   *  for a debit and actively wrong for money arriving. */
  async function fund(amount: number) {
    await env.DB.prepare(
      "INSERT INTO ledger (id,user_id,amount_coins,reason,created_at) VALUES (?,?,?,?,?)",
    )
      .bind(crypto.randomUUID(), userId, amount, "task_reward", "2026-08-01T00:00:00Z")
      .run();
  }

  const balanceNow = async () =>
    (
      await env.DB.prepare(
        "SELECT COALESCE(SUM(amount_coins),0) AS bal FROM ledger WHERE user_id = ?",
      )
        .bind(userId)
        .first<{ bal: number }>()
    )?.bal ?? 0;

  async function unlocked(over: Partial<CreatePuzzleInput> = {}) {
    const made = await create(over);
    await call("POST", `/api/puzzles/${made.id}/unlock`);
    return made;
  }

  describe("opening it", () => {
    it("takes the unlock price and opens it", async () => {
      await fund(1000);
      const made = await create({ unlockPrice: 300 });

      const res = await call("POST", `/api/puzzles/${made.id}/unlock`);

      expect(res.status).toBe(201);
      expect((await res.json()) as PuzzlePurchase).toMatchObject({ spentCoins: 300 });
      expect(await balanceNow()).toBe(700);
    });

    it("refuses when the wallet is short, and opens nothing", async () => {
      // The gate that matters: a conditional insert matching nothing does not
      // fail, so without `PAID_FOR` the puzzle would open for free.
      await fund(10);
      const made = await create({ unlockPrice: 300 });

      expect((await call("POST", `/api/puzzles/${made.id}/unlock`)).status).toBe(402);

      const row = await env.DB.prepare("SELECT unlocked_at FROM puzzle WHERE id = ?")
        .bind(made.id)
        .first<{ unlocked_at: string | null }>();
      expect(row?.unlocked_at).toBeNull();
      expect(await balanceNow()).toBe(10);
    });

    it("refuses to charge twice for the same puzzle", async () => {
      await fund(1000);
      const made = await unlocked({ unlockPrice: 300 });

      expect((await call("POST", `/api/puzzles/${made.id}/unlock`)).status).toBe(409);
      expect(await balanceNow()).toBe(700);
    });
  });

  describe("buying pieces", () => {
    it("charges the sum and grants every one of them", async () => {
      await fund(1000);
      const made = await unlocked({ unlockPrice: 0, piecePrice: 25 });

      const res = await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0, 1, 2] });

      expect(res.status).toBe(201);
      expect((await res.json()) as PuzzlePurchase).toMatchObject({
        spentCoins: 75,
        pieces: [0, 1, 2],
      });
      expect(await balanceNow()).toBe(925);
    });

    it("grants nothing when the wallet cannot cover the whole selection", async () => {
      // All of it or none of it. Coins gone and a picture still full of holes
      // is the worst outcome available.
      await fund(40);
      const made = await unlocked({ unlockPrice: 0, piecePrice: 25 });

      expect(
        (await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0, 1] })).status,
      ).toBe(402);

      const rows = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM puzzle_piece WHERE puzzle_id = ?",
      )
        .bind(made.id)
        .first<{ n: number }>();
      expect(rows?.n).toBe(0);
      expect(await balanceNow()).toBe(40);
    });

    it("will not sell inside a locked puzzle", async () => {
      await fund(1000);
      const made = await create({ piecePrice: 5 });

      expect((await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0] })).status).toBe(
        409,
      );
    });

    it("refuses an index the grid does not have", async () => {
      await fund(1000);
      const made = await unlocked({ pieces: 12, unlockPrice: 0 });

      expect((await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [12] })).status).toBe(
        400,
      );
    });

    it("never charges for a piece already owned", async () => {
      // Two taps racing on a flaky connection is a normal thing to do, and
      // paying twice for one piece is the outcome that cannot be undone.
      await fund(1000);
      const made = await unlocked({ unlockPrice: 0, piecePrice: 25 });
      await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0] });

      const res = await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0, 1] });

      expect((await res.json()) as PuzzlePurchase).toMatchObject({ spentCoins: 25, pieces: [1] });
      expect(await balanceNow()).toBe(950);
    });

    it("409s a selection that is entirely owned rather than charging zero", async () => {
      await fund(1000);
      const made = await unlocked({ unlockPrice: 0, piecePrice: 25 });
      await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0] });

      expect((await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0] })).status).toBe(
        409,
      );
    });

    it("refuses more than one batch can hold", async () => {
      await fund(100000);
      const made = await unlocked({ pieces: 144, unlockPrice: 0, piecePrice: 1 });
      const tooMany = Array.from({ length: 61 }, (_, i) => i);

      expect(
        (await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: tooMany })).status,
      ).toBe(400);
    });

    it("refuses the same piece twice in one request", async () => {
      await fund(1000);
      const made = await unlocked({ unlockPrice: 0 });

      expect(
        (await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [3, 3] })).status,
      ).toBe(400);
    });
  });

  describe("finishing it", () => {
    it("stamps it complete on the purchase that fills the last hole", async () => {
      await fund(1000);
      const made = await unlocked({ pieces: 12, unlockPrice: 0, piecePrice: 1 });

      const first = await call("POST", `/api/puzzles/${made.id}/pieces`, {
        pieces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
      expect(((await first.json()) as PuzzlePurchase).completed).toBe(false);

      const last = await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [11] });

      expect(((await last.json()) as PuzzlePurchase).completed).toBe(true);
      const row = await env.DB.prepare("SELECT completed_at FROM puzzle WHERE id = ?")
        .bind(made.id)
        .first<{ completed_at: string | null }>();
      expect(row?.completed_at).toEqual(expect.any(String));
    });

    it("stamps it once, not again on a later read", async () => {
      await fund(1000);
      const made = await unlocked({ pieces: 12, unlockPrice: 0, piecePrice: 1 });
      await call("POST", `/api/puzzles/${made.id}/pieces`, {
        pieces: Array.from({ length: 12 }, (_, i) => i),
      });

      const stamped = await env.DB.prepare("SELECT completed_at FROM puzzle WHERE id = ?")
        .bind(made.id)
        .first<{ completed_at: string }>();

      // Everything is owned, so a further purchase has nothing to sell.
      expect((await call("POST", `/api/puzzles/${made.id}/pieces`, { pieces: [0] })).status).toBe(
        409,
      );
      const again = await env.DB.prepare("SELECT completed_at FROM puzzle WHERE id = ?")
        .bind(made.id)
        .first<{ completed_at: string }>();
      expect(again?.completed_at).toBe(stamped?.completed_at);
    });
  });
});
