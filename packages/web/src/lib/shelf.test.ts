import type { AlbumSummary, Puzzle } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { puzzleStatus, shelf } from "./shelf";

const album = (over: Partial<AlbumSummary> = {}): AlbumSummary =>
  ({
    id: "a1",
    title: "Kitchen heroes",
    coverKey: `img/${"a".repeat(64)}.jpg`,
    status: "in_progress",
    percent: 50,
    owned: 6,
    total: 12,
    remaining: 6,
    almostThere: false,
    unlockPrice: 500,
    createdAt: "2026-07-01T00:00:00Z",
    ...over,
  }) as AlbumSummary;

const puzzle = (over: Partial<Puzzle> = {}): Puzzle => ({
  id: "p1",
  title: "The harbour",
  description: null,
  imageKey: `img/${"b".repeat(64)}.jpg`,
  imageWidth: 1536,
  imageHeight: 1024,
  unlockPrice: 100,
  piecePrice: 25,
  rows: 2,
  cols: 3,
  hideLocked: false,
  unlockedAt: "2026-07-02T00:00:00Z",
  completedAt: null,
  sealedAt: "2026-07-02T00:00:00Z",
  createdAt: "2026-07-02T00:00:00Z",
  ownedCount: 3,
  ...over,
});

const ids = (items: ReturnType<typeof shelf>) => items.map((item) => item.id);

describe("what state a puzzle is in", () => {
  it("answers in the vocabulary the tabs already use", () => {
    // Three states, the same three an album has, so a puzzle answers the
    // existing questions rather than needing new ones.
    expect(puzzleStatus(puzzle({ unlockedAt: null }))).toBe("locked");
    expect(puzzleStatus(puzzle())).toBe("in_progress");
    expect(puzzleStatus(puzzle({ completedAt: "2026-08-01T00:00:00Z" }))).toBe("completed");
  });

  it("is finished even though it is also unlocked", () => {
    // Both timestamps are set on a finished puzzle; completion wins.
    expect(
      puzzleStatus(
        puzzle({ unlockedAt: "2026-07-02T00:00:00Z", completedAt: "2026-08-01T00:00:00Z" }),
      ),
    ).toBe("completed");
  });
});

describe("one shelf, two kinds of thing", () => {
  it("holds both", () => {
    expect(ids(shelf([album()], [puzzle()], "all", "title"))).toHaveLength(2);
  });

  it("keeps them apart by kind, so each can draw itself", () => {
    const items = shelf([album()], [puzzle()], "all", "title");
    expect(items.map((item) => item.kind).sort()).toEqual(["album", "puzzle"]);
  });

  it("filters a puzzle by the same tab that filters an album", () => {
    const locked = shelf(
      [album({ status: "locked" })],
      [puzzle({ id: "open" }), puzzle({ id: "shut", unlockedAt: null })],
      "locked",
      "title",
    );

    expect(ids(locked)).toContain("shut");
    expect(ids(locked)).not.toContain("open");
  });

  it("shows nothing rather than everything when a tab matches nothing", () => {
    expect(shelf([], [puzzle()], "completed", "title")).toEqual([]);
  });
});

describe("the order, which has to match the server's", () => {
  // The album list arrives already sorted by the API. Mixing puzzles in means
  // re-sorting here, so this comparator has to agree with the one in
  // `api/routes/albumList.ts` or an album would move just because a puzzle
  // exists.
  it("sorts by title", () => {
    const items = shelf(
      [album({ id: "z", title: "Zoo" })],
      [puzzle({ id: "a", title: "Apples" })],
      "all",
      "title",
    );
    expect(ids(items)).toEqual(["a", "z"]);
  });

  it("sorts newest first by created", () => {
    const items = shelf(
      [album({ id: "old", createdAt: "2026-01-01T00:00:00Z" })],
      [puzzle({ id: "new", createdAt: "2026-09-01T00:00:00Z" })],
      "all",
      "created",
    );
    expect(ids(items)).toEqual(["new", "old"]);
  });

  it("sorts fullest first by progress, counting a puzzle's pieces", () => {
    // 5 of 6 pieces is 83%, ahead of an album at 50%.
    const items = shelf(
      [album({ id: "half", percent: 50 })],
      [puzzle({ id: "nearly", ownedCount: 5 })],
      "all",
      "progress",
    );
    expect(ids(items)).toEqual(["nearly", "half"]);
  });

  it("puts what is in progress first, then locked, then done", () => {
    const items = shelf(
      [album({ id: "done", status: "completed" }), album({ id: "shut", status: "locked" })],
      [puzzle({ id: "going" })],
      "all",
      "status",
    );
    expect(ids(items)).toEqual(["going", "shut", "done"]);
  });

  it("breaks a tie the same way the server does — fullest, then alphabetically", () => {
    const items = shelf(
      [
        album({ id: "b", title: "Bravo", percent: 10 }),
        album({ id: "a", title: "Alpha", percent: 10 }),
      ],
      [],
      "all",
      "status",
    );
    expect(ids(items)).toEqual(["a", "b"]);
  });

  it("gives an empty puzzle 0% rather than dividing by zero", () => {
    // `rows * cols` cannot be zero — a CHECK forbids it — but the shelf should
    // not be the thing that discovers otherwise.
    const items = shelf([], [puzzle({ rows: 0, cols: 0, ownedCount: 0 })], "all", "progress");
    expect(items).toHaveLength(1);
  });
});
