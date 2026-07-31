import type { AlbumStatus, AlbumSummary } from "@sticker-collector/shared";
import { ALBUM_SORTS } from "@sticker-collector/shared";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { AlbumCard } from "../components/AlbumCard";
import { BackupNudge } from "../components/BackupNudge";
import { AlbumGrid, AppHeader } from "../components/layout";
import { UnlockDialog } from "../components/UnlockDialog";
import { Button, Chip, EmptyState, ErrorState, Skeleton, Tabs } from "../components/ui";
import { ApiError } from "../lib/api";
import { useUnlockAlbum } from "../lib/mutations";
import { useAlbums, useWallet } from "../lib/queries";

/**
 * The shelf.
 *
 * Every album lives in one section — locked and unlocked together, and there is
 * no store (`prd/04-albums.md` §2). Status both filters and sorts (§3): the
 * tabs hide and show, the sort chips only reorder.
 */
const FILTERS: { value: AlbumStatus | "all"; label: string; tone: "violet" | "cyan" | "lime" }[] = [
  { value: "all", label: "All", tone: "violet" },
  { value: "in_progress", label: "Collecting", tone: "cyan" },
  { value: "locked", label: "Locked", tone: "violet" },
  { value: "completed", label: "Done", tone: "lime" },
];

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
  const [filter, setFilter] = useState<AlbumStatus | "all">("all");
  const [sort, setSort] = useState<(typeof ALBUM_SORTS)[number]>("status");
  const [unlocking, setUnlocking] = useState<AlbumSummary | null>(null);
  const [page, setPage] = useState(0);

  const albums = useAlbums({ status: filter === "all" ? undefined : filter, sort });
  const wallet = useWallet();
  const unlock = useUnlockAlbum();

  if (albums.error instanceof ApiError && albums.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const rows = albums.data ?? [];

  const { pages, current, visible } = paginate(rows, page);

  return (
    <>
      <AppHeader
        title="Albums"
        trailing={
          // §Creating 1: the listing is where a new album starts.
          <Link
            to="/albums/new"
            className="rounded-lg border border-cyan px-3 py-1 font-body text-sm font-bold text-cyan"
          >
            Create
          </Link>
        }
      />

      {/* Right where an album is created or finished. */}
      <BackupNudge albums={rows} />

      <Tabs
        items={FILTERS}
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setPage(0);
        }}
        label="Album status"
        className="mb-3"
      />

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
            onClick={() => {
              setSort(option);
              setPage(0);
            }}
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon="◈"
          title={filter === "all" ? "No albums yet" : "Nothing here"}
          description={
            filter === "all"
              ? "Albums are yours to author. Build one, seal it, then earn your way through it."
              : "No album has that status right now."
          }
        />
      ) : (
        <>
          <AlbumGrid>
            {visible.map((album) => (
              <AlbumCard key={album.id} album={album} onUnlock={() => setUnlocking(album)} />
            ))}
          </AlbumGrid>

          {/* Absent entirely on a single page: controls that can never do
              anything are noise on the screen they sit on. */}
          {pages > 1 && (
            <nav aria-label="Album pages" className="mt-5 flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                tone="neutral"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
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
                onClick={() => setPage(current + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}

      <UnlockDialog
        album={unlocking}
        balance={wallet.data?.balance ?? 0}
        pending={unlock.isPending}
        onClose={() => setUnlocking(null)}
        onConfirm={async () => {
          if (!unlocking) return;
          await unlock.mutateAsync(unlocking.id);
          setUnlocking(null);
        }}
      />
    </>
  );
}
