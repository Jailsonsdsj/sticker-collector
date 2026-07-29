import type { AlbumDetail } from "@sticker-collector/shared";
import { ALBUM_MAX_STICKERS, createAlbumSchema } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import {
  type AlbumDraft,
  type DraftAction,
  draftCost,
  draftFromAlbum,
  initialDraft,
  isPristine,
  isSealable,
  reduce,
  tierCounts,
  toPayload,
  validate,
  zeroOddsWarnings,
} from "./albumDraft";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

const apply = (draft: AlbumDraft, ...actions: DraftAction[]) =>
  actions.reduce((state, action) => reduce(state, action), draft);

/** A draft with everything the seal requires. */
const sealable = (): AlbumDraft =>
  apply(
    initialDraft,
    { type: "field", field: "title", value: "Kitchen heroes" },
    { type: "cover", imageKey: key(999) },
    { type: "addSticker", imageKey: key(1), tier: "common" },
    { type: "addSticker", imageKey: key(2), tier: "rare" },
  );

describe("the draft the wizard opens on", () => {
  it("starts from a working economy, not four empty fields", () => {
    expect(initialDraft.odds).toEqual({ common: 60, rare: 25, epic: 12, legendary: 3 });
    expect(validate(initialDraft).odds).toBeUndefined();
    expect(initialDraft.randomPrice).toBeGreaterThan(0);
  });

  it("is not sealable until it has a title, a cover and a sticker", () => {
    const problems = validate(initialDraft);
    expect(problems.title).toBeTruthy();
    expect(problems.coverKey).toBeTruthy();
    expect(problems.stickers).toBeTruthy();
    expect(isSealable(initialDraft)).toBe(false);
  });
});

describe("stickers", () => {
  it("takes the same picture only once", () => {
    // Two identical images are one content address, so a second copy would show
    // the same slot twice.
    const draft = apply(
      initialDraft,
      { type: "addSticker", imageKey: key(1) },
      { type: "addSticker", imageKey: key(1) },
    );
    expect(draft.stickers).toHaveLength(1);
  });

  it("defaults a new sticker to common", () => {
    const draft = apply(initialDraft, { type: "addSticker", imageKey: key(1) });
    expect(draft.stickers[0]?.tier).toBe("common");
  });

  it("re-tiers without reordering", () => {
    const draft = apply(
      initialDraft,
      { type: "addSticker", imageKey: key(1) },
      { type: "addSticker", imageKey: key(2) },
      { type: "retier", imageKey: key(1), tier: "legendary" },
    );
    expect(draft.stickers.map((s) => s.imageKey)).toEqual([key(1), key(2)]);
    expect(draft.stickers[0]?.tier).toBe("legendary");
  });

  it("removes one without disturbing the rest", () => {
    const draft = apply(
      initialDraft,
      { type: "addSticker", imageKey: key(1) },
      { type: "addSticker", imageKey: key(2) },
      { type: "removeSticker", imageKey: key(1) },
    );
    expect(draft.stickers.map((s) => s.imageKey)).toEqual([key(2)]);
  });

  it("stops at the size the API will accept", () => {
    // One batch, and D1 binds 100 parameters per statement — the cap is real.
    let draft = initialDraft;
    for (let i = 0; i < ALBUM_MAX_STICKERS + 5; i++) {
      draft = reduce(draft, { type: "addSticker", imageKey: key(i + 1) });
    }
    expect(draft.stickers).toHaveLength(ALBUM_MAX_STICKERS);
    expect(validate(draft).stickers).toBeUndefined();
  });

  it("counts the tiers for the preview", () => {
    const draft = apply(
      initialDraft,
      { type: "addSticker", imageKey: key(1), tier: "common" },
      { type: "addSticker", imageKey: key(2), tier: "common" },
      { type: "addSticker", imageKey: key(3), tier: "legendary" },
    );
    expect(tierCounts(draft)).toEqual({ common: 2, rare: 0, epic: 0, legendary: 1 });
  });
});

describe("the ten numbers", () => {
  it("applies the same odds rule the API and the database apply", () => {
    const draft = sealable();
    expect(validate(apply(draft, { type: "odds", tier: "legendary", value: 4 })).odds).toBeTruthy();
    expect(validate(apply(draft, { type: "odds", tier: "common", value: 10 })).odds).toBeTruthy();
  });

  it("permits a zero-odds tier, and says so out loud", () => {
    const draft = apply(
      sealable(),
      { type: "odds", tier: "common", value: 70 },
      { type: "odds", tier: "rare", value: 30 },
      { type: "odds", tier: "epic", value: 0 },
      { type: "odds", tier: "legendary", value: 0 },
      { type: "addSticker", imageKey: key(3), tier: "epic" },
    );
    expect(validate(draft).odds).toBeUndefined();
    expect(zeroOddsWarnings(draft)).toEqual(["epic"]);
  });

  it("warns only about tiers that actually hold stickers", () => {
    const draft = apply(
      sealable(),
      { type: "odds", tier: "common", value: 70 },
      { type: "odds", tier: "rare", value: 30 },
      { type: "odds", tier: "epic", value: 0 },
      { type: "odds", tier: "legendary", value: 0 },
    );
    expect(zeroOddsWarnings(draft)).toEqual([]);
  });

  it("puts the odds back to the default in one action", () => {
    const wrecked = apply(sealable(), { type: "odds", tier: "common", value: 1 });
    expect(validate(wrecked).odds).toBeTruthy();
    expect(validate(reduce(wrecked, { type: "resetOdds" })).odds).toBeUndefined();
  });

  it("refuses a free random pull", () => {
    // At zero a duplicate refunds nothing and "always a net loss" says nothing.
    const draft = apply(sealable(), { type: "price", field: "randomPrice", value: 0 });
    expect(validate(draft).randomPrice).toBeTruthy();
  });

  it("keeps prices whole and non-negative", () => {
    const draft = apply(
      sealable(),
      { type: "price", field: "unlockPrice", value: -50 },
      { type: "tierPrice", tier: "rare", value: 12.7 },
    );
    expect(draft.unlockPrice).toBe(0);
    expect(draft.prices.rare).toBe(13);
  });

  it("survives a field that is not a number", () => {
    const draft = apply(sealable(), { type: "price", field: "unlockPrice", value: Number.NaN });
    expect(draft.unlockPrice).toBe(0);
  });

  it("totals the unlock price plus every sticker at its tier's price", () => {
    const draft = apply(
      initialDraft,
      { type: "price", field: "unlockPrice", value: 500 },
      { type: "addSticker", imageKey: key(1), tier: "common" }, // 20
      { type: "addSticker", imageKey: key(2), tier: "legendary" }, // 400
    );
    expect(draftCost(draft)).toBe(920);
  });
});

describe("what gets sent", () => {
  it("produces a body the real request schema accepts", () => {
    // The wizard cannot invent a shape the API will reject: this parses with the
    // same schema the Worker uses.
    const parsed = createAlbumSchema.safeParse(toPayload(sealable()));
    expect(parsed.success).toBe(true);
  });

  it("trims the title and drops an empty description", () => {
    const draft = apply(
      sealable(),
      { type: "field", field: "title", value: "  Kitchen heroes  " },
      { type: "field", field: "description", value: "   " },
    );
    const payload = toPayload(draft);
    expect(payload.title).toBe("Kitchen heroes");
    expect(payload.description).toBeNull();
  });

  it("keeps a real description", () => {
    const draft = apply(sealable(), {
      type: "field",
      field: "description",
      value: "Everyone who feeds me",
    });
    expect(toPayload(draft).description).toBe("Everyone who feeds me");
  });

  it("is rejected by the schema when the draft is not sealable", () => {
    const parsed = createAlbumSchema.safeParse(toPayload(initialDraft));
    expect(parsed.success).toBe(false);
  });
});

describe("replacing the whole draft", () => {
  it("restores a draft loaded from disk", () => {
    const restored = sealable();
    expect(reduce(initialDraft, { type: "replace", draft: restored })).toEqual(restored);
  });
});

/** A finished album, as the detail endpoint returns it. */
const source = (): AlbumDetail => ({
  album: {
    id: "alb-source",
    title: "Kitchen heroes",
    description: "Everyone who feeds me",
    coverKey: key(999),
    derivedFromAlbumId: null,
    unlockPrice: 750,
    randomPrice: 41,
    prices: { common: 11, rare: 22, epic: 33, legendary: 44 },
    odds: { common: 70, rare: 20, epic: 10, legendary: 0 },
    unlockedAt: "2026-07-02T00:00:00Z",
    completedAt: "2026-07-20T00:00:00Z",
    sealedAt: "2026-07-01T00:00:00Z",
    createdAt: "2026-07-01T00:00:00Z",
    editionNumber: 2,
    owned: 2,
    total: 2,
    percent: 100,
    status: "completed",
    remaining: 0,
    almostThere: false,
    affordable: false,
  },
  stickers: [
    {
      id: "stk-b",
      albumId: "alb-source",
      imageKey: key(2),
      tier: "legendary",
      slotIndex: 1,
      quantity: 4,
    },
    {
      id: "stk-a",
      albumId: "alb-source",
      imageKey: key(1),
      tier: "common",
      slotIndex: 0,
      quantity: 1,
    },
  ],
});

describe("a new edition of an existing album", () => {
  it("inherits the artwork by key, so nothing is re-imported", () => {
    const draft = draftFromAlbum(source());
    expect(draft.coverKey).toBe(key(999));
    expect(draft.stickers.map((s) => s.imageKey)).toEqual([key(1), key(2)]);
  });

  it("carries no ownership — a draft cannot even express it", () => {
    // The source holds four copies of the legendary. The new edition's sticker
    // is `{imageKey, tier}` and nothing else, which is what makes "every sticker
    // starts locked" structural rather than a promise.
    const draft = draftFromAlbum(source());
    expect(draft.stickers).toEqual([
      { imageKey: key(1), tier: "common" },
      { imageKey: key(2), tier: "legendary" },
    ]);
  });

  it("inherits the title, description and every price as a starting point", () => {
    const draft = draftFromAlbum(source());
    expect(draft.title).toBe("Kitchen heroes");
    expect(draft.description).toBe("Everyone who feeds me");
    expect(draft.unlockPrice).toBe(750);
    expect(draft.randomPrice).toBe(41);
    expect(draft.prices).toEqual({ common: 11, rare: 22, epic: 33, legendary: 44 });
    expect(draft.odds).toEqual({ common: 70, rare: 20, epic: 10, legendary: 0 });
  });

  it("remembers which album it came from", () => {
    expect(draftFromAlbum(source()).derivedFromAlbumId).toBe("alb-source");
    expect(toPayload(draftFromAlbum(source())).derivedFromAlbumId).toBe("alb-source");
  });

  it("does not link an album built from scratch to anything", () => {
    expect(toPayload(sealable()).derivedFromAlbumId).toBeNull();
  });

  it("keeps the inherited prices editable", () => {
    // They arrive pre-filled and may be changed (§Creating from existing 2).
    const draft = reduce(draftFromAlbum(source()), {
      type: "price",
      field: "unlockPrice",
      value: 10,
    });
    expect(draft.unlockPrice).toBe(10);
    expect(draft.derivedFromAlbumId).toBe("alb-source");
  });

  it("keeps the inherited sticker set editable", () => {
    const draft = reduce(draftFromAlbum(source()), { type: "removeSticker", imageKey: key(1) });
    expect(draft.stickers).toEqual([{ imageKey: key(2), tier: "legendary" }]);
  });

  it("produces a body the real request schema accepts", () => {
    expect(createAlbumSchema.safeParse(toPayload(draftFromAlbum(source()))).success).toBe(true);
  });
});

describe("the first question", () => {
  it("is worth asking only before anything is decided", () => {
    expect(isPristine(initialDraft)).toBe(true);
    expect(isPristine(sealable())).toBe(false);
  });

  it("is answered by copying an album", () => {
    expect(isPristine(draftFromAlbum(source()))).toBe(false);
  });

  it("is answered by a single typed character", () => {
    const started = reduce(initialDraft, { type: "field", field: "title", value: "K" });
    expect(isPristine(started)).toBe(false);
  });
});
