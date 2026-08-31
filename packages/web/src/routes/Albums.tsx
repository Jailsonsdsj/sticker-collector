import { ALBUM_SORTS } from "@sticker-collector/shared";
import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { AlbumCard } from "../components/AlbumCard";
import { BackupNudge } from "../components/BackupNudge";
import { CreateChoiceDialog } from "../components/CreateChoiceDialog";
import { AlbumGrid, AppHeader } from "../components/layout";
import { PuzzleCard } from "../components/PuzzleCard";
import { SearchField } from "../components/SearchField";
import { UnlockDialog } from "../components/UnlockDialog";
import { Button, Chip, EmptyState, ErrorState, Skeleton, Tabs } from "../components/ui";
import { ApiError } from "../lib/api";
import { useUnlockAlbum, useUnlockPuzzle } from "../lib/mutations";
import { playUnlock } from "../lib/placement";
import { useAlbums, usePuzzles, useWallet } from "../lib/queries";
import {
  matching,
  ofKind,
  type ShelfFilter,
  type ShelfKind,
  serverStatus,
  shelf,
  type UnlockTarget,
  unlockTarget,
} from "../lib/shelf";
import { readShelf, type ShelfState, writeShelf } from "../lib/shelfParams";

/**
 * The shelf.
 *
 * Every album lives in one section — locked and unlocked together, and there is
 * no store (`prd/04-albums.md` §2). Status both filters and sorts (§3): the
 * tabs hide and show, the sort chips only reorder.
 */
const FILTERS: { value: ShelfFilter; label: string; tone: "violet" | "cyan" | "lime" }[] = [
  { value: "collecting", label: "Collecting", tone: "cyan" },
  { value: "locked", label: "Locked", tone: "violet" },
  { value: "all", label: "All", tone: "violet" },
  { value: "done", label: "Done", tone: "lime" },
];

/**
 * What an empty grid says.
 *
 * Collecting is now a **landing** screen rather than somewhere you chose to go,
 * so "nothing has that status" would be a true sentence and a dead end — it is
 * the one filter that has to say where to go next. The other two are a choice
 * the user made, and telling them the choice came up empty is enough.
 */
const NOTHING: Record<ShelfFilter, { title: string; description: string }> = {
  all: {
    title: "Nothing here yet",
    description: "Albums and puzzles are yours to author. Make one, then earn your way through it.",
  },
  collecting: {
    title: "Nothing on the go",
    description: "Open one from Locked to start collecting, or make something new.",
  },
  locked: { title: "Nothing here", description: "Nothing has that status right now." },
  done: { title: "Nothing here", description: "Nothing has that status right now." },
};

/**
 * The kinds on offer, and what they are called.
 *
 * A second axis rather than four more tabs: status and kind are two questions,
 * and one row of tabs can only answer one of them at a time.
 */
const KINDS: { value: ShelfKind; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "album", label: "Albums" },
  { value: "puzzle", label: "Puzzles" },
];

/** What a kind-filtered shelf says when that kind is not on this tab. */
const NO_KIND: Record<Exclude<ShelfKind, "both">, string> = {
  album: "No albums here",
  puzzle: "No puzzles here",
};

const SORT_LABELS: Record<(typeof ALBUM_SORTS)[number], string> = {
  status: "Status",
  progress: "Progress",
  title: "Title",
  created: "Newest",
};

/** Albums per page. Enough to fill a phone screen without an endless scroll. */
export const ALBUMS_PER_PAGE = 10;

/**
 * One page of the shelf.
 *
 * Paged on the client: the listing is filtered and sorted server-side and
 * returns one user's albums — tens of rows, not thousands — so a `limit`/
 * `offset` round trip would add an API surface and a loading state to save a
 * payload that is already small. If the shelf outgrows that, this is the
 * function to change.
 *
 * The page is **clamped, not reset**. A refetch can shorten the list under a
 * page the user is already on — an album deleted on another device, a filter
 * applied server-side — and an out-of-range page renders an empty grid, which
 * reads as "you have no albums" rather than "there is no page 3".
 */
export function paginate<T>(rows: T[], page: number, perPage = ALBUMS_PER_PAGE) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { pages, current, visible: rows.slice(current * perPage, (current + 1) * perPage) };
}

export function Albums() {
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState<UnlockTarget | null>(null);

  /**
   * The filters live in the URL, not in this component.
   *
   * They were `useState`, which meant they died with the component: pick
   * Locked, open an album, press back, and the shelf returned on Collecting.
   * The browser restored the page it was told about, and the page had never
   * been told.
   */
  const [params, setParams] = useSearchParams();
  const { filter, kind, sort, query, page } = readShelf(params);

  /**
   * **`replace`, never push.** A pushed entry per keystroke would turn Back
   * into an undo button for the search box, and the way out of the shelf would
   * be however many taps the user had spent filtering it. Replacing keeps one
   * entry for the shelf, holding whatever state it is in when something is
   * opened from it — which is the entry Back comes home to.
   */
  const update = (next: Partial<ShelfState>) =>
    setParams(writeShelf({ filter, kind, sort, query, page, ...next }), { replace: true });

  // Undefined for a tab that spans two statuses — the server takes one, so
  // Collecting fetches unfiltered and `shelf` narrows it.
  const albums = useAlbums({ status: serverStatus(filter), sort });
  const puzzles = usePuzzles();
  const wallet = useWallet();
  const unlockAlbum = useUnlockAlbum();
  const unlockPuzzle = useUnlockPuzzle();

  if (albums.error instanceof ApiError && albums.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const balance = wallet.data?.balance ?? 0;
  const rows = albums.data ?? [];
  // One grid, both kinds. The server has already filtered and sorted the
  // albums; `shelf` mixes the puzzles in and re-sorts the whole thing with a
  // comparator that matches the server's, so an album does not move just
  // because a puzzle exists.
  const onTab = shelf(rows, puzzles.data ?? [], filter, sort);
  const shown = ofKind(onTab, kind);
  const items = matching(shown, query);
  // A search that matches nothing is not an empty shelf, and saying "make one"
  // to someone who has forty is the wrong answer to the wrong question. Judged
  // against `shown`, not `onTab`: an empty list because the kind filter is on
  // is not a search that missed.
  const noMatches = query.trim() !== "" && items.length === 0 && shown.length > 0;
  // Likewise, a tab with albums on it but no puzzles is not "nothing on the go".
  const noneOfKind = kind !== "both" && shown.length === 0 && onTab.length > 0;

  const { pages, current, visible } = paginate(items, page);

  return (
    <>
      <AppHeader
        title="Collection"
        trailing={
          // §Creating 1: the listing is where a new album starts — and now a
          // puzzle too, so the link became a fork.
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="cursor-pointer rounded-lg border border-cyan px-3 py-1 font-body text-sm font-bold text-cyan"
          >
            Create
          </button>
        }
      />

      {/* Right where an album is created or finished. */}
      <CreateChoiceDialog open={creating} onClose={() => setCreating(false)} />

      {/* Puzzles too: a puzzle's master image exists nowhere else, so it is the
          most irreplaceable thing the app holds. */}
      <BackupNudge items={[...rows, ...(puzzles.data ?? [])]} />

      <Tabs
        items={FILTERS}
        value={filter}
        onChange={(next) => update({ filter: next, page: 0 })}
        label="Collection status"
        className="mb-3"
      />

      {/* Directly under the tabs. The tabs say which shelf you are looking at;
          the search says which part of it — and both come before the chips
          that decide what is shown and in what order. */}
      <SearchField
        id="shelf-search"
        noun="your collection"
        value={query}
        // Page 3 of the old list is not page 3 of the new one.
        onChange={(next) => update({ query: next, page: 0 })}
      />

      <div className="mb-2 flex items-center gap-2 overflow-x-auto">
        <span className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Show</span>
        {KINDS.map((option) => (
          <Chip
            key={option.value}
            size="sm"
            tone="violet"
            fill="tint"
            font="body"
            selected={kind === option.value}
            onClick={() => update({ kind: option.value, page: 0 })}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-2 overflow-x-auto">
        <span className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Sort</span>
        {ALBUM_SORTS.map((option) => (
          <Chip
            key={option}
            size="sm"
            tone="cyan"
            fill="tint"
            font="body"
            selected={sort === option}
            onClick={() => update({ sort: option, page: 0 })}
          >
            {SORT_LABELS[option]}
          </Chip>
        ))}
      </div>

      {albums.isLoading ? (
        <AlbumGrid>
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </AlbumGrid>
      ) : albums.isError ? (
        // Before the empty check, never after. A failed read has no rows
        // either, and "No albums yet" would tell someone their collection is
        // gone when the truth is that the request never landed.
        <ErrorState error={albums.error} onRetry={() => void albums.refetch()} />
      ) : noMatches ? (
        <EmptyState
          icon="⌕"
          title="Nothing here matches that"
          description="Search looks at titles only."
          action={
            <Button variant="outline" tone="neutral" onClick={() => update({ query: "" })}>
              Clear the search
            </Button>
          }
        />
      ) : noneOfKind ? (
        <EmptyState
          icon="◈"
          title={NO_KIND[kind as Exclude<ShelfKind, "both">]}
          description="Nothing of that kind has this status. Try Both, or another tab."
        />
      ) : items.length === 0 ? (
        <EmptyState icon="◈" {...NOTHING[filter]} />
      ) : (
        <>
          <AlbumGrid>
            {visible.map((item) =>
              item.kind === "album" ? (
                <AlbumCard
                  key={item.id}
                  album={item.album}
                  onUnlock={() => setUnlocking(unlockTarget(item))}
                />
              ) : (
                <PuzzleCard
                  key={item.id}
                  puzzle={item.puzzle}
                  // An album's affordability is computed by the server, which
                  // knows the balance while it builds the row. A puzzle's is
                  // computed here, against the wallet this screen already
                  // holds — one number, two ways of reaching it.
                  affordable={item.puzzle.unlockPrice <= balance}
                  onUnlock={() => setUnlocking(unlockTarget(item))}
                />
              ),
            )}
          </AlbumGrid>

          {/* Absent entirely on a single page: controls that can never do
              anything are noise on the screen they sit on. */}
          {pages > 1 && (
            <nav aria-label="Shelf pages" className="mt-5 flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                tone="neutral"
                disabled={current === 0}
                onClick={() => update({ page: current - 1 })}
              >
                Previous
              </Button>
              <span aria-live="polite" className="font-numeric text-sm text-ink-secondary">
                {current + 1} of {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                tone="neutral"
                disabled={current === pages - 1}
                onClick={() => update({ page: current + 1 })}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}

      {/* One dialog for both kinds. The question is identical — what does
          this cost, and what is left — and only the mutation differs. */}
      <UnlockDialog
        item={unlocking}
        balance={balance}
        pending={unlockAlbum.isPending || unlockPuzzle.isPending}
        onClose={() => setUnlocking(null)}
        onConfirm={async () => {
          if (!unlocking) return;
          const { kind, id } = unlocking;
          await (kind === "album" ? unlockAlbum : unlockPuzzle).mutateAsync(id);
          setUnlocking(null);
          // After the dialog closes and the card re-renders unlocked: the ring
          // is on the card, and the card is only there once the list refreshes.
          requestAnimationFrame(() => playUnlock(id));
        }}
      />
    </>
  );
}
