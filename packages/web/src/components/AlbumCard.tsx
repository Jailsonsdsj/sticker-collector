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
        data-album-id={album.id}
        to={`/albums/${album.id}`}
        aria-label={`${album.title}, ${album.percent}% complete`}
        className="relative block overflow-hidden rounded-2xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{ aspectRatio: "var(--aspect-card)" }}
      >
        {/* Sits behind the cover and does nothing until an unlock plays it. */}
        <span
          data-part="unlock-ring"
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-32 rounded-full border-2 border-coin opacity-0"
        />
        <ImageTile
          src={imageSrc(album.coverKey)}
          className="object-cover transition-[filter] duration-500"
          style={{ filter: locked ? "var(--filter-locked)" : "var(--filter-unlocked)" }}
        />

        {/* Says what it is, because the shelf holds two kinds of thing and a
            puzzle has said so since it arrived. A card that names one kind and
            not the other reads as the unnamed one being the default, which is
            not how the shelf works.

            `overlay` is a scrim and **ignores the tone by design** — it has to
            read on any artwork — so the word is what tells the two apart, not
            the colour. The tone is set to the card's own accent to match how
            the puzzle card declares its badge, and for the day the variant
            starts honouring it. */}
        <span className="absolute top-2 left-2">
          <Badge tone="cyan" variant="overlay" size="sm">
            Album
          </Badge>
        </span>

        {/* Moved to the right to make room, which is where a puzzle's status
            badge already sits. */}
        {/* The last slot is the hardest and the most motivating, so the app
            points at it rather than leaving the user to count. */}
        {album.almostThere && (
          <span className="absolute top-2 right-2">
            <Badge tone="coin" variant="overlay" size="sm">
              {album.remaining === 1 ? "1 to go" : `${album.remaining} to go`}
            </Badge>
          </span>
        )}

        {album.status === "completed" && (
          <span className="absolute top-2 right-2">
            <Badge tone="lime" variant="overlay" size="sm">
              Complete
            </Badge>
          </span>
        )}
      </Link>

      <h3 className="truncate text-center font-body text-sm font-bold text-ink" title={album.title}>
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
