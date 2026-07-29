import type { AlbumDetail } from "@sticker-collector/shared";
import { buildAlbumPdf } from "./pdf";
import { exportFileName, type Paper } from "./pdfLayout";

export interface ExportOptions {
  album: AlbumDetail;
  paper: Paper;
  /** The user's own calendar day — it goes in the file name. */
  today: string;
  /** Called as images arrive, so a 60-sticker album can show progress. */
  onProgress?: (fetched: number, total: number) => void;
  /** Injected so the orchestration is testable; defaults to a real download. */
  save?: (bytes: Uint8Array, filename: string) => void;
  fetchImage?: (key: string) => Promise<Uint8Array>;
}

/**
 * Turns a finished album into a PDF on the user's disk.
 *
 * Entirely client-side beyond fetching the pictures the album already owns —
 * no server generates anything (`prd/06-export.md`). The export is the reward
 * for completing an album and may be run as many times as the user likes, for
 * as long as the album exists, so nothing here records or limits it.
 */
export async function exportAlbum(options: ExportOptions): Promise<string> {
  const { album, stickers } = options.album;

  // Each distinct picture is fetched once, however many slots use it — a
  // derived edition can legitimately repeat a key.
  const keys = [...new Set([album.coverKey, ...stickers.map((s) => s.imageKey)])];
  const fetcher = options.fetchImage ?? fetchImageBytes;

  const images = new Map<string, Uint8Array>();
  for (const key of keys) {
    images.set(key, await fetcher(key));
    options.onProgress?.(images.size, keys.length);
  }

  const bytes = await buildAlbumPdf({
    album,
    stickers,
    images,
    paper: options.paper,
    today: options.today,
  });

  const filename = exportFileName(album.title, options.today);
  (options.save ?? saveToDisk)(bytes, filename);
  return filename;
}

/**
 * The bytes as stored. Same-origin, so the session cookie authenticates it and
 * no token has to be threaded through.
 *
 * A missing image aborts the export. `pdf.ts` would happily print the frame
 * with an empty slot, which is the right call for robustness and the wrong one
 * for an artifact: a printed sheet with a blank square is worse than no file.
 */
async function fetchImageBytes(key: string): Promise<Uint8Array> {
  const response = await fetch(`/api/images/${key}`, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`An image could not be loaded, so the album was not exported.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** The one line that pokes the DOM. Everything above it is testable. */
function saveToDisk(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
