import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AlbumDraft, initialDraft, reduce } from "./albumDraft";
import { clearDraft, loadDraft, saveDraft } from "./draftStore";

/**
 * jsdom has no IndexedDB, so without `fake-indexeddb` this layer could only be
 * shipped unproven — and it is the layer standing between a refreshed tab and
 * an hour of the user's work.
 */

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

const draft = (over: Partial<AlbumDraft> = {}): AlbumDraft => ({
  ...reduce(initialDraft, { type: "field", field: "title", value: "Kitchen heroes" }),
  coverKey: key(999),
  stickers: [{ imageKey: key(1), tier: "legendary" }],
  ...over,
});

beforeEach(() => {
  // A fresh database per test: IndexedDB is durable by design, which is exactly
  // what makes it leak between tests.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await clearDraft();
});

describe("keeping a draft across a reload", () => {
  it("has nothing before anything is saved", async () => {
    expect(await loadDraft()).toBeNull();
  });

  it("returns exactly what was stored", async () => {
    const saved = draft();
    await saveDraft(saved);
    expect(await loadDraft()).toEqual(saved);
  });

  it("keeps every decision, not just the text fields", async () => {
    // The whole arrangement lives here until the seal — losing the tier
    // assignments would be as bad as losing the title.
    const saved = draft({
      stickers: [
        { imageKey: key(1), tier: "common" },
        { imageKey: key(2), tier: "legendary" },
      ],
      odds: { common: 70, rare: 30, epic: 0, legendary: 0 },
      prices: { common: 5, rare: 10, epic: 15, legendary: 20 },
      unlockPrice: 1234,
      randomPrice: 7,
    });
    await saveDraft(saved);

    const loaded = await loadDraft();
    expect(loaded?.stickers).toEqual(saved.stickers);
    expect(loaded?.odds).toEqual(saved.odds);
    expect(loaded?.prices).toEqual(saved.prices);
    expect(loaded?.unlockPrice).toBe(1234);
  });

  it("keeps one draft, not a pile of them", async () => {
    await saveDraft(draft({ title: "First" }));
    await saveDraft(draft({ title: "Second" }));
    expect((await loadDraft())?.title).toBe("Second");
  });
});

describe("clearing", () => {
  it("leaves nothing behind once the album is sealed", async () => {
    await saveDraft(draft());
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  it("is safe to call when there is nothing to clear", async () => {
    await expect(clearDraft()).resolves.toBeUndefined();
  });
});

describe("when the stored record is not a draft", () => {
  it("discards debris rather than crashing the wizard", async () => {
    // A tab that died mid-write must cost one draft, not the whole screen.
    await saveDraft({ title: "half" } as unknown as AlbumDraft);
    expect(await loadDraft()).toBeNull();
  });

  it("discards a record of the wrong shape entirely", async () => {
    await saveDraft("not a draft" as unknown as AlbumDraft);
    expect(await loadDraft()).toBeNull();
  });

  it("reports no draft when the database cannot be opened at all", async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error("blocked");
      },
    } as unknown as IDBFactory;

    expect(await loadDraft()).toBeNull();
  });
});
