import type { AlbumStatus, AlbumSummary } from "@sticker-collector/shared";
import { ALBUM_SORTS } from "@sticker-collector/shared";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { AlbumCard } from "../components/AlbumCard";
import { BackupNudge } from "../components/BackupNudge";
import { AlbumGrid, AppHeader } from "../components/layout";
import { UnlockDialog } from "../components/UnlockDialog";
import { Chip, EmptyState, ErrorState, Skeleton, Tabs } from "../components/ui";
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

export function Albums() {
  const [filter, setFilter] = useState<AlbumStatus | "all">("all");
  const [sort, setSort] = useState<(typeof ALBUM_SORTS)[number]>("status");
  const [unlocking, setUnlocking] = useState<AlbumSummary | null>(null);

  const albums = useAlbums({ status: filter === "all" ? undefined : filter, sort });
  const wallet = useWallet();
  const unlock = useUnlockAlbum();

  if (albums.error instanceof ApiError && albums.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const rows = albums.data ?? [];

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
        onChange={setFilter}
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
            onClick={() => setSort(option)}
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
        <AlbumGrid>
          {rows.map((album) => (
            <AlbumCard key={album.id} album={album} onUnlock={() => setUnlocking(album)} />
          ))}
        </AlbumGrid>
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
