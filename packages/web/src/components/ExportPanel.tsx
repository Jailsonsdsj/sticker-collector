import type { AlbumDetail } from "@sticker-collector/shared";
import { todayIn } from "@sticker-collector/shared";
import { useState } from "react";
import { exportAlbum } from "../lib/exportAlbum";
import type { Paper } from "../lib/pdfLayout";
import { today } from "../lib/timezone";
import { Button, Chip } from "./ui";

export interface ExportPanelProps {
  album: AlbumDetail;
  /** Injected in tests; the real one writes a file to disk. */
  save?: (bytes: Uint8Array, filename: string) => void;
}

const PAPERS: { value: Paper; label: string }[] = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "US Letter" },
];

/**
 * The reward for finishing an album.
 *
 * Only ever rendered for a completed album — an incomplete one has empty slots,
 * and a sheet with holes in it is not the artifact. There is no limit on how
 * often it runs: the export may be repeated for as long as the album exists
 * (`prd/06-export.md`).
 */
export function ExportPanel({ album, save }: ExportPanelProps) {
  const [paper, setPaper] = useState<Paper>("a4");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const filename = await exportAlbum({
        album,
        paper,
        today: today(),
        onProgress: (done, total) => setProgress({ done, total }),
        save,
      });
      setLastFile(filename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The album could not be exported.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section
      aria-label="Print export"
      className="mt-8 flex flex-col gap-3 rounded-2xl border border-lime bg-panel p-4"
    >
      <div>
        <p className="font-display text-2xl tracking-display uppercase italic text-ink">
          Ready to print
        </p>
        <p className="font-body text-sm text-ink-secondary">
          Every slot is filled. The sheet prints at true size — {album.stickers.length} stickers at
          50 × 70 mm, nine to a page, with cut guides.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Paper</span>
        {PAPERS.map((option) => (
          <Chip
            key={option.value}
            size="sm"
            tone="lime"
            fill="tint"
            font="body"
            selected={paper === option.value}
            onClick={() => setPaper(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* `loading` already disables the button — passing both would be two
            sources of truth for one state. */}
        <Button tone="lime" loading={busy} onClick={run}>
          {busy ? "Building…" : "Export PDF"}
        </Button>

        {progress && (
          <p aria-live="polite" className="font-numeric text-sm text-ink-dim">
            {progress.done} of {progress.total} images
          </p>
        )}

        {/* No limit and no record: the export can be run again whenever. */}
        {!busy && lastFile && !error && (
          <p className="font-body text-sm text-ink-dim">Saved {lastFile}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="font-body text-sm text-magenta">
          {error}
        </p>
      )}
    </section>
  );
}
