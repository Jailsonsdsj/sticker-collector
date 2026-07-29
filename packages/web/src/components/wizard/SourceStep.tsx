import type { AlbumSummary } from "@sticker-collector/shared";
import { useState } from "react";
import { imageSrc } from "../../lib/imageUpload";
import { Button, EmptyState, Skeleton } from "../ui";

export interface SourceStepProps {
  albums: AlbumSummary[];
  loading: boolean;
  seeding: boolean;
  onScratch: () => void;
  onCopy: (albumId: string) => void;
}

/**
 * The first question: from scratch, or from an album that already exists
 * (`prd/04-albums.md` §Creating 2).
 *
 * The second option exists to make a **new version** of an album without
 * re-importing its artwork. Nothing is uploaded — the pictures come across as
 * content-addressed keys — and no ownership comes with them: every sticker in
 * the new edition starts locked and must be earned again.
 */
export function SourceStep({ albums, loading, seeding, onScratch, onCopy }: SourceStepProps) {
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <div className="flex flex-col gap-3">
        <Button block tone="cyan" onClick={onScratch}>
          Start from scratch
        </Button>
        <Button block variant="outline" tone="violet" onClick={() => setPicking(true)}>
          Start from an existing album
        </Button>
        <p className="font-body text-sm text-ink-dim">
          A new version inherits the artwork and the prices of an album you already made. The
          original keeps everything — its stickers, its progress and its exports.
        </p>
      </div>
    );
  }

  if (loading) return <Skeleton variant="block" />;

  if (albums.length === 0) {
    return (
      <EmptyState
        icon="◈"
        title="Nothing to copy yet"
        description="You need an album before you can make a new version of one."
        action={
          <Button variant="outline" tone="cyan" onClick={onScratch}>
            Start from scratch
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-sm text-ink-secondary">
        Which album should the new version be based on?
      </p>

      <ul className="flex flex-col gap-2">
        {albums.map((album) => (
          <li key={album.id}>
            <button
              type="button"
              disabled={seeding}
              onClick={() => onCopy(album.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-panel p-2 text-left disabled:opacity-40"
            >
              <img
                src={imageSrc(album.coverKey)}
                alt=""
                className="w-12 rounded-lg object-cover"
                style={{ aspectRatio: "var(--aspect-card)" }}
              />
              <span className="flex-1">
                <span className="block font-body text-sm font-bold text-ink">{album.title}</span>
                <span className="block font-body text-2xs text-ink-dim">
                  {album.total} stickers · edition {album.editionNumber}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button variant="ghost" tone="neutral" size="sm" onClick={() => setPicking(false)}>
        Back
      </Button>
    </div>
  );
}
