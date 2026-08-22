import { type Puzzle, pieceCount } from "@sticker-collector/shared";
import { Link } from "react-router";
import { imageSrc } from "../lib/imageUpload";
import { Badge, ImageTile, ProgressBar } from "./ui";

export interface PuzzleCardProps {
  puzzle: Puzzle;
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
 */
export function PuzzleCard({ puzzle }: PuzzleCardProps) {
  const total = pieceCount({ rows: puzzle.rows, cols: puzzle.cols });
  const done = puzzle.completedAt !== null;
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

      <h3
        className="truncate text-center font-body text-sm font-bold text-ink"
        title={puzzle.title}
      >
        {puzzle.title}
      </h3>

      {puzzle.unlockedAt ? (
        <ProgressBar
          size="sm"
          tone={done ? "lime" : "violet"}
          value={percent}
          aria-label={`${puzzle.title} progress`}
        />
      ) : (
        // No unlock button here, unlike an album's card. A puzzle is opened
        // from its own board, where the picture it buys is the thing on screen.
        <p className="text-center font-numeric text-2xs text-ink-muted">
          Locked · {puzzle.unlockPrice}
        </p>
      )}
    </div>
  );
}
