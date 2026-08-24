import type { AlbumSummary, Puzzle } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { puzzleStatus, type ShelfFilter, serverStatus, shelf, unlockTarget } from "./shelf";

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
  randomPrice: 40,
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
    expect(shelf([], [puzzle()], "done", "title")).toEqual([]);
  });
});

describe("which tab shows what", () => {
  const on = (filter: ShelfFilter) =>
    ids(
      shelf(
        [
          album({ id: "shut", status: "locked" }),
          album({ id: "going", status: "in_progress" }),
          album({ id: "finished", status: "completed" }),
        ],
        [],
        filter,
        "title",
      ),
    ).sort();

  it("keeps a finished collection on Collecting, beside the ones on the go", () => {
    // The work is the same work. Moving a collection out of sight the moment
    // the last sticker lands makes the shelf emptier the more you have done —
    // and Collecting is the tab the app opens on.
    expect(on("collecting")).toEqual(["finished", "going"]);
  });

  it("still narrows to the finished ones on Done", () => {
    expect(on("done")).toEqual(["finished"]);
  });

  it("leaves Locked alone", () => {
    expect(on("locked")).toEqual(["shut"]);
  });

  it("shows everything on All, including what the other tabs split", () => {
    expect(on("all")).toEqual(["finished", "going", "shut"]);
  });

  it("lets a finished collection answer two tabs, which is the point", () => {
    expect(on("collecting")).toContain("finished");
    expect(on("done")).toContain("finished");
  });

  it("does the same for a puzzle, since the tabs do not know the difference", () => {
    const items = shelf(
      [],
      [
        puzzle({ id: "whole", completedAt: "2026-07-03T00:00:00Z" }),
        puzzle({ id: "part-way" }),
        puzzle({ id: "shut", unlockedAt: null }),
      ],
      "collecting",
      "title",
    );

    expect(ids(items).sort()).toEqual(["part-way", "whole"]);
  });
});

describe("what the server can be asked for", () => {
  it("names the one status a single-status tab wants", () => {
    expect(serverStatus("locked")).toBe("locked");
    expect(serverStatus("done")).toBe("completed");
  });

  it("asks for nothing when the tab spans more than one", () => {
    // `?status=` takes a single value. A tab covering two has to fetch
    // unfiltered and let `shelf` narrow it, or half its rows never arrive.
    expect(serverStatus("collecting")).toBeUndefined();
    expect(serverStatus("all")).toBeUndefined();
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

describe("what an unlock is about", () => {
  it("carries the kind, because the two need different mutations", () => {
    // One dialog, two endpoints. Losing the kind here would post an album
    // unlock for a puzzle id and 404 at the far end.
    expect(unlockTarget({ kind: "album", id: "a1", album: album() }).kind).toBe("album");
    expect(unlockTarget({ kind: "puzzle", id: "p1", puzzle: puzzle() }).kind).toBe("puzzle");
  });

  it("takes the price and title from whichever thing it is", () => {
    expect(unlockTarget({ kind: "album", id: "a1", album: album() })).toEqual({
      kind: "album",
      id: "a1",
      title: "Kitchen heroes",
      unlockPrice: 500,
    });
    expect(unlockTarget({ kind: "puzzle", id: "p1", puzzle: puzzle() })).toEqual({
      kind: "puzzle",
      id: "p1",
      title: "The harbour",
      unlockPrice: 100,
    });
  });

  it("takes the shelf item's own id, which is what the mutation is keyed by", () => {
    const item = { kind: "puzzle", id: "p9", puzzle: puzzle({ id: "p9" }) } as const;
    expect(unlockTarget(item).id).toBe("p9");
  });
});
