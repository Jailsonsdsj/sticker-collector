/**
 * When the last backup was written, and what has been nudged about.
 *
 * Kept in `localStorage`, with one eye open about the irony: the export exists
 * partly as insurance against the browser clearing its storage, and clearing it
 * takes this date along too. The failure is mild — a restored install reads
 * "never backed up" and is told to make one, which is wrong but harmless — and
 * the alternative is a column and an endpoint for a date nobody acts on
 * automatically (see `TD-23`).
 */
const EXPORTED_AT = "sc_backup_exported_at";
const DISMISSED_FOR = "sc_backup_nudge_dismissed";

export function lastExportAt(): string | null {
  return localStorage.getItem(EXPORTED_AT);
}

export function recordExport(at: string): void {
  localStorage.setItem(EXPORTED_AT, at);
}

/**
 * The most recent moment the collection changed in a way worth backing up:
 * an album created, or an album finished (`prd/07-services.md` §Data 3).
 *
 * Derived from the listing the screen already has rather than from an event —
 * an event has to be fired from the seal *and* from whichever purchase completed
 * the album, and a missed one is a nudge that never comes.
 */
export function lastAlbumChange(
  albums: readonly { createdAt: string; completedAt: string | null }[],
): string | null {
  const moments = albums.flatMap((album) =>
    album.completedAt ? [album.createdAt, album.completedAt] : [album.createdAt],
  );
  return moments.length === 0 ? null : (moments.sort().at(-1) as string);
}

/**
 * Whether to ask for a backup.
 *
 * True when something has changed since the last export and the user has not
 * already waved *this* change away. Dismissal is per-timestamp on purpose: a
 * nudge you can silence forever is not insurance, and one that returns on every
 * visit is noise.
 */
export function shouldNudge(
  albums: readonly { createdAt: string; completedAt: string | null }[],
): boolean {
  const changed = lastAlbumChange(albums);
  if (!changed) return false;

  const exported = lastExportAt();
  if (exported && exported >= changed) return false;

  return localStorage.getItem(DISMISSED_FOR) !== changed;
}

export function dismissNudge(changedAt: string): void {
  localStorage.setItem(DISMISSED_FOR, changedAt);
}
