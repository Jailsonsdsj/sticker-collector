/// <reference lib="webworker" />
import type { ArchiveContents } from "../lib/backupArchive";
import { buildArchive, parseArchive } from "../lib/backupArchive";

/**
 * Zipping, off the main thread.
 *
 * A sixty-image archive is tens of megabytes of copying; doing it inline freezes
 * the interface for long enough to look broken (`architecture.md` §9). The
 * logic itself is in `lib/backupArchive.ts` and tested there — this file is a
 * message boundary and nothing else, which is why it has no tests of its own.
 */
type Request =
  | { kind: "build"; contents: ArchiveContents }
  | { kind: "parse"; archive: Uint8Array };

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const message = event.data;
    if (message.kind === "build") {
      const bytes = buildArchive(message.contents);
      (self as DedicatedWorkerGlobalScope).postMessage({ ok: true, bytes }, [bytes.buffer]);
      return;
    }
    const contents = parseArchive(message.archive);
    (self as DedicatedWorkerGlobalScope).postMessage({ ok: true, contents });
  } catch (cause) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      ok: false,
      error: cause instanceof Error ? cause.message : "The archive could not be processed.",
    });
  }
};
