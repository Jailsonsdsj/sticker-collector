import { ALBUM_MAX_STICKERS, createAlbumSchema } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import {
  type AlbumDraft,
  type DraftAction,
  draftCost,
  initialDraft,
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
