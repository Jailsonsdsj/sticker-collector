import { ALBUM_SORTS } from "@sticker-collector/shared";
import type { ShelfFilter, ShelfKind, ShelfSort } from "./shelf";

/**
 * The shelf's filters, held in the URL rather than in the component.
 *
 * They used to be `useState`, which meant they died with the component: pick
 * Locked, open an album, press back, and the shelf came up on Collecting again
 * — the browser restored the page it was told about, and the page had never
 * been told. The back button is a history feature, and history is the URL.
 *
 * Two things fall out of this for free. A refresh keeps the view, and a link to
 * a filtered shelf is a link someone can actually keep.
 *
 * **Defaults are never written.** `/albums` means the default view, and a URL
 * that says `?status=collecting&kind=both&sort=status&page=0` to describe it is
 * noise on every screen the user ever looks at.
 */
export interface ShelfState {
  filter: ShelfFilter;
  kind: ShelfKind;
  sort: ShelfSort;
  query: string;
  /** Zero-based, as `paginate` takes it. */
  page: number;
}

const FILTERS: readonly ShelfFilter[] = ["collecting", "locked", "all", "done"];
const KINDS: readonly ShelfKind[] = ["both", "album", "puzzle"];

/**
 * The view `/albums` means with no parameters on it.
 *
 * `collecting` because what you came to look at is the thing you are part-way
 * through; everything else is either not started or already finished. `All` is
 * still one tap away, in the middle of the tab row rather than at its head.
 *
 * The only definition of these defaults. A second copy in the component is what
 * makes a URL and a screen disagree about what "no filter" means.
 */
export const DEFAULT_SHELF: ShelfState = {
  filter: "collecting",
  kind: "both",
  sort: "status",
  query: "",
  page: 0,
};

/** The parameter names, in one place so the reader and the writer cannot drift. */
const KEY = { filter: "status", kind: "show", sort: "sort", query: "q", page: "page" } as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The state a URL describes.
 *
 * Anything unrecognised falls back to its default rather than throwing or
 * rendering empty. A URL is user input — typed, truncated by a chat client,
 * left over from an older version of this list — and `?status=banana` should
 * show the shelf, not a blank screen.
 */
export function readShelf(params: URLSearchParams): ShelfState {
  // `Number`, not `parseInt`. `parseInt("1.5")` is 1 and `parseInt("2pages")`
  // is 2 — it reads a prefix and discards the rest, which turns nonsense into a
  // plausible-looking page instead of rejecting it.
  const page = Number(params.get(KEY.page) ?? "");

  return {
    filter: oneOf(params.get(KEY.filter), FILTERS, DEFAULT_SHELF.filter),
    kind: oneOf(params.get(KEY.kind), KINDS, DEFAULT_SHELF.kind),
    sort: oneOf(params.get(KEY.sort), ALBUM_SORTS, DEFAULT_SHELF.sort),
    query: params.get(KEY.query) ?? DEFAULT_SHELF.query,
    // `paginate` clamps an out-of-range page, so this only has to reject what
    // is not a page at all.
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_SHELF.page,
  };
}

/** The URL a state describes, carrying only what differs from the default. */
export function writeShelf(state: ShelfState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.filter !== DEFAULT_SHELF.filter) params.set(KEY.filter, state.filter);
  if (state.kind !== DEFAULT_SHELF.kind) params.set(KEY.kind, state.kind);
  if (state.sort !== DEFAULT_SHELF.sort) params.set(KEY.sort, state.sort);
  if (state.query.trim() !== "") params.set(KEY.query, state.query);
  if (state.page > 0) params.set(KEY.page, String(state.page));

  return params;
}
