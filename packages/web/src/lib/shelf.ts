import type { AlbumStatus, AlbumSummary, Puzzle } from "@sticker-collector/shared";
import { pieceCount } from "@sticker-collector/shared";

/**
 * The Albums tab holds two kinds of thing now, in one grid.
 *
 * One list rather than two sections, because the question the screen answers is
 * "what have I got" and splitting it in two makes the reader ask it twice. The
 * cost is this module: something has to reduce an album and a puzzle to the
 * handful of facts the shelf sorts and filters by.
 *
 * **The comparator is a copy of the server's**, deliberately. The album list
 * arrives already sorted by `GET /api/albums?sort=`, and mixing puzzles in
 * means re-sorting the whole thing here — so this has to agree with
 * `api/routes/albumList.ts` or the same album would move when a puzzle exists.
 * The tests pin the orderings that make them agree.
 */
export type ShelfSort = "status" | "title" | "progress" | "created";

/**
 * The tabs, which are **not** the statuses.
 *
 * They were the same list until `Collecting` had to hold finished collections
 * too, and one name meaning both "this tab" and "this status" is what made that
 * a type change rather than a line change. A tab is a question the user asks;
 * a status is a fact about one thing on the shelf.
 */
export type ShelfFilter = "collecting" | "locked" | "all" | "done";

/**
 * Which statuses each tab shows.
 *
 * `collecting` is deliberately two. A finished collection is still one you are
 * collecting — the work is the same work, and moving it out of sight the moment
 * the last sticker lands makes the shelf emptier the more you have done. `done`
 * is still there for when the finished ones are the question.
 *
 * The overlap is the point, not an oversight: an album can legitimately answer
 * two of these tabs.
 */
const SHOWS: Record<ShelfFilter, readonly AlbumStatus[]> = {
  collecting: ["in_progress", "completed"],
  locked: ["locked"],
  all: ["locked", "in_progress", "completed"],
  done: ["completed"],
};

/**
 * The status to ask the server for, or nothing when the tab spans more than one.
 *
 * `GET /api/albums?status=` takes a single value, so a tab covering two has to
 * fetch unfiltered and let `shelf` narrow it — which it does anyway, since the
 * puzzles arrive unfiltered regardless. Derived from `SHOWS` rather than
 * written out again: a second list is a second thing to keep in step.
 */
export function serverStatus(filter: ShelfFilter): AlbumStatus | undefined {
  const statuses = SHOWS[filter];
  return statuses.length === 1 ? statuses[0] : undefined;
}

export type ShelfItem =
  | { kind: "album"; id: string; album: AlbumSummary }
  | { kind: "puzzle"; id: string; puzzle: Puzzle };

/**
 * A puzzle's status in the album vocabulary.
 *
 * Finished, started, or not yet opened — the same three states the tabs
 * already filter by, so a puzzle answers the existing questions rather than
 * needing new ones.
 */
export function puzzleStatus(puzzle: Puzzle): AlbumStatus {
  if (puzzle.completedAt) return "completed";
  if (puzzle.unlockedAt) return "in_progress";
  return "locked";
}

/**
 * What the shelf's unlock confirmation is about.
 *
 * Both cards open the same dialog and then need different mutations, so the
 * kind travels with the two facts the dialog shows. Flattened here rather than
 * in the route: reducing an album and a puzzle to the facts they share is what
 * this module already exists to do.
 */
export type UnlockTarget = {
  kind: ShelfItem["kind"];
  id: string;
  title: string;
  unlockPrice: number;
};

export function unlockTarget(item: ShelfItem): UnlockTarget {
  const { title, unlockPrice } = item.kind === "album" ? item.album : item.puzzle;
  return { kind: item.kind, id: item.id, title, unlockPrice };
}

function statusOf(item: ShelfItem): AlbumStatus {
  return item.kind === "album" ? item.album.status : puzzleStatus(item.puzzle);
}

function titleOf(item: ShelfItem): string {
  return item.kind === "album" ? item.album.title : item.puzzle.title;
}

function createdOf(item: ShelfItem): string {
  return item.kind === "album" ? item.album.createdAt : item.puzzle.createdAt;
}

/** How full, 0–100. A puzzle's is its pieces; an album already carries one. */
function percentOf(item: ShelfItem): number {
  if (item.kind === "album") return item.album.percent;
  const total = pieceCount({ rows: item.puzzle.rows, cols: item.puzzle.cols });
  return total === 0 ? 0 : (item.puzzle.ownedCount / total) * 100;
}

/** Mirrors `STATUS_ORDER` in `api/routes/albumList.ts`. */
const STATUS_ORDER: Record<AlbumStatus, number> = { in_progress: 0, locked: 1, completed: 2 };

function comparator(sort: ShelfSort) {
  return (a: ShelfItem, b: ShelfItem): number => {
    switch (sort) {
      case "title":
        return titleOf(a).localeCompare(titleOf(b));
      case "progress":
        return percentOf(b) - percentOf(a) || titleOf(a).localeCompare(titleOf(b));
      case "created":
        return createdOf(b).localeCompare(createdOf(a));
      case "status":
        return (
          STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] ||
          percentOf(b) - percentOf(a) ||
          titleOf(a).localeCompare(titleOf(b))
        );
    }
  };
}

/**
 * The shelf: albums and puzzles, filtered and sorted together.
 *
 * `albums` arrives already filtered by the server — asking it for
 * `status=locked` returns only those — so only the puzzles need filtering here.
 * Passing the filter anyway keeps the two halves honest: a server that stopped
 * filtering would be caught by the same tests rather than by a user seeing a
 * completed album under the Locked tab.
 */
export function shelf(
  albums: readonly AlbumSummary[],
  puzzles: readonly Puzzle[],
  filter: ShelfFilter,
  sort: ShelfSort,
): ShelfItem[] {
  const items: ShelfItem[] = [
    ...albums.map((album): ShelfItem => ({ kind: "album", id: album.id, album })),
    ...puzzles.map((puzzle): ShelfItem => ({ kind: "puzzle", id: puzzle.id, puzzle })),
  ];

  return items.filter((item) => SHOWS[filter].includes(statusOf(item))).sort(comparator(sort));
}
