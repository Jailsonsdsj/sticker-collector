import type { AlbumSummary } from "@sticker-collector/shared";
import { useState } from "react";
import { Link } from "react-router";
import { dismissNudge, lastAlbumChange, shouldNudge } from "../lib/backupState";
import { Button } from "./ui";

export interface BackupNudgeProps {
  /**
   * Everything worth losing — albums AND puzzles.
   *
   * Structural, not `AlbumSummary[]`: the nudge only ever asks when the last
   * change was, and a puzzle carries the same two timestamps. Typing it to
   * albums is what made creating a puzzle — the most irreplaceable thing in the
   * app, because its master image exists nowhere else — fail to prompt for the
   * backup that would save it.
   */
  items: readonly { createdAt: string; completedAt: string | null }[];
}

/**
 * Asks for a backup after an album or a puzzle is created or finished.
 *
 * Backup is a feature, not a menu item (`prd/07-services.md` §Data 3): the
 * moment there is something worth losing is the moment to mention it. It is a
 * suggestion and never a modal — nothing here blocks the shelf.
 */
export function BackupNudge({ items }: BackupNudgeProps) {
  const [hidden, setHidden] = useState(false);
  const changed = lastAlbumChange(items);

  if (hidden || !shouldNudge(items)) return null;

  return (
    <aside
      aria-label="Back up your collection"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-coin bg-panel p-3"
    >
      <p className="flex-1 font-body text-sm text-ink-secondary">
        Your collection has changed since the last backup. One file holds everything, images
        included — it is the only way back if this browser forgets you.
      </p>

      <Link
        to="/settings"
        className="rounded-lg border border-coin px-3 py-1 font-body text-sm font-bold text-coin"
      >
        Back up
      </Link>

      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        onClick={() => {
          // Silences this change only. A new album asks again.
          if (changed) dismissNudge(changed);
          setHidden(true);
        }}
      >
        Later
      </Button>
    </aside>
  );
}
