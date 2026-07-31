import type { AlbumSummary } from "@sticker-collector/shared";
import { Link } from "react-router";
import { imageSrc } from "../lib/imageUpload";
import { Badge, Button, ImageTile, ProgressBar } from "./ui";
import { cx } from "./ui/cx";

export interface AlbumCardProps {
  album: AlbumSummary;
  onUnlock: () => void;
}

/**
 * One album on the shelf.
 *
 * The cover is **one image**. Locked and unlocked render the identical `src`
 * and differ only by `--filter-locked` — there is never a second, grayscale
 * asset to store, upload or keep in step, and the reveal is a transition on
 * that filter rather than a swap.
 *
 * Beneath the cover sits a single full-width control spanning the card
 * (`prd/04-albums.md` §6): **Unlock ‹price›** while locked, the progress bar
 * once it is open.
 */
export function AlbumCard({ album, onUnlock }: AlbumCardProps) {
  const locked = album.status === "locked";

  return (
    <div className="flex flex-col gap-2">
      <Link
        to={`/albums/${album.id}`}
        aria-label={`${album.title}, ${album.percent}% complete`}
        className="relative block overflow-hidden rounded-2xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{ aspectRatio: "var(--aspect-card)" }}
      >
        <ImageTile
          src={imageSrc(album.coverKey)}
          className="object-cover transition-[filter] duration-500"
          style={{ filter: locked ? "var(--filter-locked)" : "var(--filter-unlocked)" }}
        />

        {/* The last slot is the hardest and the most motivating, so the app
            points at it rather than leaving the user to count. */}
        {album.almostThere && (
          <span className="absolute top-2 left-2">
            <Badge tone="coin" variant="overlay" size="sm">
              {album.remaining === 1 ? "1 to go" : `${album.remaining} to go`}
            </Badge>
          </span>
        )}

        {album.status === "completed" && (
          <span className="absolute top-2 left-2">
            <Badge tone="lime" variant="overlay" size="sm">
              Complete
            </Badge>
          </span>
        )}
      </Link>

      <h3 className="truncate font-body text-sm font-bold text-ink" title={album.title}>
        {album.title}
      </h3>

      {locked ? (
        <Button
          block
          size="sm"
          tone={album.affordable ? "coin" : "neutral"}
          variant={album.affordable ? "solid" : "outline"}
          onClick={onUnlock}
          // The affordability cue: an album the balance could open right now is
          // marked, so "what can I afford" needs no arithmetic (§Enhancements).
          className={cx(album.affordable && "shadow-coin")}
        >
          Unlock {album.unlockPrice}
        </Button>
      ) : (
        <ProgressBar
          value={album.percent}
          size="md"
          tone={album.status === "completed" ? "lime" : "cyan"}
          label={`${album.percent}%`}
          aria-label={`${album.title}: ${album.owned} of ${album.total} collected`}
        />
      )}
    </div>
  );
}
