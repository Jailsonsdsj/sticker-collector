import { type Puzzle, pieceCount } from "@sticker-collector/shared";
import { Link } from "react-router";
import { imageSrc } from "../lib/imageUpload";
import { Badge, Button, ImageTile, ProgressBar } from "./ui";
import { cx } from "./ui/cx";

export interface PuzzleCardProps {
  puzzle: Puzzle;
  /** Whether the balance covers `unlockPrice` right now. */
  affordable: boolean;
  onUnlock: () => void;
}

/**
 * One puzzle on the shelf, beside the albums.
 *
 * **The cover stays grey until the last piece lands** — not until it is
 * unlocked, the way an album's does. An album is a container you open and then
 * fill; a puzzle is one picture that is either whole or is not, so the colour
 * has to mean finished rather than merely paid for. One image and one filter,
 * as everywhere: there is no second grayscale asset.
 *
 * Badged, because the shelf now holds two kinds of thing and a card that does
 * not say which is a card you have to open to find out.
 *
 * Beneath the cover sits the **same single full-width control an album card
 * has**: *Unlock ‹price›* while locked, the progress bar once it is open. Two
 * cards side by side in one grid, where one can be bought from the shelf and
 * the other has to be opened first, is a difference the user has to learn for
 * no reason.
 */
export function PuzzleCard({ puzzle, affordable, onUnlock }: PuzzleCardProps) {
  const total = pieceCount({ rows: puzzle.rows, cols: puzzle.cols });
  const done = puzzle.completedAt !== null;
  const locked = puzzle.unlockedAt === null;
  const percent = total === 0 ? 0 : (puzzle.ownedCount / total) * 100;

  return (
    <div className="flex flex-col gap-2">
      <Link
        data-puzzle-id={puzzle.id}
        to={`/puzzles/${puzzle.id}`}
        aria-label={`${puzzle.title}, puzzle, ${puzzle.ownedCount} of ${total} pieces`}
        className="relative block overflow-hidden rounded-2xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{ aspectRatio: "var(--aspect-card)" }}
      >
        {/* Sits behind the cover and does nothing until an unlock plays it. */}
        <span
          data-part="unlock-ring"
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-32 rounded-full border-2 border-coin opacity-0"
        />

        {/* `cover`, like an album's. The card is a thumbnail in a grid of
            thumbnails, and a letterboxed one reads as a broken tile beside
            them. Nothing is lost by it: the whole picture is what got stored,
            and the board is where you see all of it. */}
        <ImageTile
          src={imageSrc(puzzle.imageKey)}
          className="object-cover transition-[filter] duration-500"
          // Grey until finished. Unlocking buys the right to start, not the
          // picture.
          style={{ filter: done ? "var(--filter-unlocked)" : "var(--filter-locked)" }}
        />

        <span className="absolute top-2 left-2">
          <Badge tone="violet" variant="overlay" size="sm">
            Puzzle
          </Badge>
        </span>

        {done && (
          <span className="absolute top-2 right-2">
            <Badge tone="lime" variant="overlay" size="sm">
              Complete
            </Badge>
          </span>
        )}
      </Link>

      {/* Wraps rather than truncates. A cut title tells you a name exists and
          refuses to say what it is, on a card whose whole job is to be
          recognised — and the tooltip that used to carry the rest is not
          reachable on the phone this is mostly used on. `break-words` handles
          the single unbroken word a title can be.

          One step down, not two. Measured at 390px: 10px, 11px and 12px all
          wrap real titles to the same number of lines, so the extra step bought
          nothing and cost legibility on the smallest text on the screen.

          `min-h-[2lh]` keeps two cards in a row aligned. Once titles can wrap,
          a one-line title beside a two-line one staggers the bars underneath
          them, and a grid of tiles that do not line up reads as broken rather
          than as one title being longer. */}
      <h3 className="min-h-[2lh] text-center font-body text-xs font-bold break-words text-ink">
        {puzzle.title}
      </h3>

      {locked ? (
        <Button
          block
          size="sm"
          tone={affordable ? "coin" : "neutral"}
          variant={affordable ? "solid" : "outline"}
          onClick={onUnlock}
          // The affordability cue an album card carries: a thing the balance
          // could open right now is marked, so "what can I afford" needs no
          // arithmetic.
          className={cx(affordable && "shadow-coin")}
        >
          Unlock {puzzle.unlockPrice}
        </Button>
      ) : (
        // The album card's bar, exactly: same size, same tones, same number
        // written inside it. Side by side in one grid, a thin unlabelled sliver
        // next to a full labelled bar read as two different kinds of progress
        // rather than as the same thing measured twice.
        <ProgressBar
          value={percent}
          size="md"
          tone={done ? "lime" : "cyan"}
          label={`${Math.round(percent)}%`}
          aria-label={`${puzzle.title}: ${puzzle.ownedCount} of ${total} pieces`}
        />
      )}
    </div>
  );
}
