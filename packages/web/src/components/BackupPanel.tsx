import { todayIn } from "@sticker-collector/shared";
import { useRef, useState } from "react";
import { exportBackup, restoreBackup } from "../lib/backupClient";
import { lastExportAt, recordExport } from "../lib/backupState";
import { Button, Input } from "./ui";

export interface BackupPanelProps {
  /** Injected in tests; the real ones talk to the API and the disk. */
  onExport?: typeof exportBackup;
  onRestore?: typeof restoreBackup;
}

/** Trimmed and case-insensitive, matching the album-delete confirmation. */
const CONFIRM_WORD = "RESTORE";

/**
 * Export and restore.
 *
 * The export is the recovery story: it is how a lost passphrase is recovered and
 * the insurance against a browser evicting its storage (`prd/07-services.md`
 * §Data). It is always available, whatever state the albums are in.
 *
 * Restore is gated behind typing the word, because it is the one action that can
 * replace everything — and because a file picker is a single tap away from a
 * mis-tap.
 */
export function BackupPanel({
  onExport = exportBackup,
  onRestore = restoreBackup,
}: BackupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(() => lastExportAt());

  const confirmed = typed.trim().toLowerCase() === CONFIRM_WORD.toLowerCase();

  const runExport = async () => {
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const filename = await onExport({
        today: todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
        onProgress: (done, total) => setProgress(`${done} of ${total} images`),
      });
      // Recorded only on success: a failed export is not a backup, and telling
      // the user otherwise is worse than telling them nothing.
      const at = new Date().toISOString();
      recordExport(at);
      setExportedAt(at);
      setMessage(`Saved ${filename}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The backup could not be written.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const runRestore = async () => {
    if (!archive) return;
    setBusy("restore");
    setError(null);
    setMessage(null);
    try {
      const result = await onRestore({
        archive: archive.bytes,
        onProgress: (done, total) => setProgress(`${done} of ${total} images`),
      });
      const rows = Object.values(result.restored).reduce((sum, n) => sum + n, 0);
      setMessage(`Restored ${rows} rows from ${archive.name}.`);
      setArchive(null);
      setTyped("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That backup could not be restored.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <section aria-label="Backup" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl tracking-display uppercase italic text-ink">Backup</h2>
        <p className="font-body text-sm text-ink-secondary">
          One file with everything in it, images included. This is how a lost passphrase is
          recovered, and the insurance against the browser clearing its storage.
        </p>
        <p className="font-body text-sm text-ink-dim">
          {exportedAt ? `Last backed up ${readableDate(exportedAt)}.` : "Never backed up."}
        </p>

        <div className="flex items-center gap-3">
          <Button tone="cyan" loading={busy === "export"} onClick={runExport}>
            Export backup
          </Button>
          {busy === "export" && progress && (
            <span aria-live="polite" className="font-numeric text-sm text-ink-dim">
              {progress}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-border border-t pt-4">
        <h3 className="font-body text-sm font-bold text-ink">Restore from a backup</h3>
        <p className="font-body text-sm text-ink-secondary">
          Restoring writes a backup into an empty install. It cannot overwrite an account that
          already holds data — the coin ledger is append-only by design.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          aria-label="Choose a backup file"
          className="font-body text-sm text-ink-dim"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setArchive({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
            setError(null);
            setMessage(null);
          }}
        />

        {archive && (
          <>
            <Input
              id="restore-confirm"
              label={`Type ${CONFIRM_WORD} to confirm`}
              hint={CONFIRM_WORD}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                tone="magenta"
                disabled={!confirmed}
                loading={busy === "restore"}
                onClick={runRestore}
              >
                Restore everything
              </Button>
              {busy === "restore" && progress && (
                <span aria-live="polite" className="font-numeric text-sm text-ink-dim">
                  {progress}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {message && <p className="font-body text-sm text-lime">{message}</p>}
      {error && (
        <p role="alert" className="font-body text-sm text-magenta">
          {error}
        </p>
      )}
    </section>
  );
}

/** A date a person can read, in their own locale. */
function readableDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
