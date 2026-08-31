import { describe, expect, it } from "vitest";
import { DEFAULT_SHELF, readShelf, type ShelfState, writeShelf } from "./shelfParams";

const read = (search: string) => readShelf(new URLSearchParams(search));
const write = (over: Partial<ShelfState> = {}) =>
  writeShelf({ ...DEFAULT_SHELF, ...over }).toString();

describe("what a URL says the shelf is showing", () => {
  it("gives the default view for a bare /albums", () => {
    expect(read("")).toEqual(DEFAULT_SHELF);
  });

  it("reads every filter back", () => {
    expect(read("status=locked&show=puzzle&sort=title&q=harbour&page=2")).toEqual({
      filter: "locked",
      kind: "puzzle",
      sort: "title",
      query: "harbour",
      page: 2,
    });
  });

  it("keeps a query with spaces and punctuation intact", () => {
    expect(read("q=north+pier%21").query).toBe("north pier!");
  });
});

describe("a URL is user input", () => {
  // Typed by hand, truncated by a chat client, left over from an older version
  // of this list. `?status=banana` should show the shelf, not a blank screen.
  it("falls back rather than believing a status that does not exist", () => {
    expect(read("status=banana").filter).toBe(DEFAULT_SHELF.filter);
  });

  it("falls back on an unknown kind and sort", () => {
    expect(read("show=sticker").kind).toBe(DEFAULT_SHELF.kind);
    expect(read("sort=colour").sort).toBe(DEFAULT_SHELF.sort);
  });

  it("refuses a page that is not a number", () => {
    expect(read("page=three").page).toBe(0);
    expect(read("page=").page).toBe(0);
  });

  it("refuses a negative or fractional page", () => {
    expect(read("page=-4").page).toBe(0);
    expect(read("page=1.5").page).toBe(0);
  });

  it("ignores parameters it does not know", () => {
    expect(read("utm_source=x&status=done")).toEqual({ ...DEFAULT_SHELF, filter: "done" });
  });
});

describe("what the shelf writes back", () => {
  it("writes nothing at all for the default view", () => {
    // `/albums` means the default. A URL spelling that out in four parameters
    // is noise on the screen the user looks at most.
    expect(write()).toBe("");
  });

  it("writes only what differs", () => {
    expect(write({ filter: "locked" })).toBe("status=locked");
    expect(write({ sort: "title" })).toBe("sort=title");
  });

  it("writes all of them when all of them differ", () => {
    const params = new URLSearchParams(
      write({ filter: "done", kind: "album", sort: "progress", query: "kitchen", page: 3 }),
    );
    expect(Object.fromEntries(params)).toEqual({
      status: "done",
      show: "album",
      sort: "progress",
      q: "kitchen",
      page: "3",
    });
  });

  it("treats a whitespace-only search as no search", () => {
    // Otherwise a stray space in the box puts `?q=+` in the URL and pins an
    // empty filter to the view forever.
    expect(write({ query: "   " })).toBe("");
  });

  it("comes back out the way it went in", () => {
    // The property that matters: any state survives a round trip through a URL.
    const states: ShelfState[] = [
      DEFAULT_SHELF,
      { filter: "locked", kind: "puzzle", sort: "title", query: "a b", page: 7 },
      { filter: "done", kind: "album", sort: "created", query: "", page: 0 },
      { ...DEFAULT_SHELF, query: "?&=" },
    ];

    for (const state of states) {
      expect(readShelf(writeShelf(state))).toEqual(state);
    }
  });
});
