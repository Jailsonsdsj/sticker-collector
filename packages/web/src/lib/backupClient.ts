import type { BackupManifest, RestoreResult } from "@sticker-collector/shared";
import { ApiError, api } from "./api";
import { type ArchiveContents, backupFileName, buildArchive, parseArchive } from "./backupArchive";

export interface ExportOptions {
  today: string;
  onProgress?: (fetched: number, total: number) => void;
  /** Injected in tests; the real one writes a file to disk. */
  save?: (bytes: Uint8Array, filename: string) => void;
  fetchImage?: (key: string) => Promise<Uint8Array>;
  /** Injected so the zip can be built off the main thread. */
  build?: (contents: ArchiveContents) => Uint8Array;
}

/**
 * Exports everything: the data, and every image it points at.
 *
 * The images are fetched one at a time on purpose. Sixty parallel requests from
 * a phone is a good way to have several of them fail, and the whole point of
 * this file is that it is complete.
 */
export async function exportBackup(options: ExportOptions): Promise<string> {
  const manifest = await api<BackupManifest>("/api/backup/manifest");
  const fetcher = options.fetchImage ?? fetchImageBytes;

  const images = new Map<string, Uint8Array>();
  for (const key of manifest.imageKeys) {
    images.set(key, await fetcher(key));
    options.onProgress?.(images.size, manifest.imageKeys.length);
  }

  const bytes = (options.build ?? buildArchive)({ manifest, images });
  const filename = backupFileName(options.today);
  (options.save ?? saveToDisk)(bytes, filename);
  return filename;
}

export interface RestoreOptions {
  archive: Uint8Array;
  onProgress?: (uploaded: number, total: number) => void;
  uploadImage?: (key: string, bytes: Uint8Array) => Promise<void>;
  parse?: (bytes: Uint8Array) => ArchiveContents;
}

/**
 * Restores a backup file.
 *
 * **Images go up before the manifest does.** The other order would leave an
 * account holding albums that reference images which were never uploaded — a
 * broken state that looks complete, and is only fixable by restoring again.
 * This way a failed upload leaves the account exactly as empty as it was.
 */
export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const { manifest, images } = (options.parse ?? parseArchive)(options.archive);
  const uploader = options.uploadImage ?? uploadImageBytes;

  let uploaded = 0;
  for (const [key, bytes] of images) {
    await uploader(key, bytes);
    uploaded += 1;
    options.onProgress?.(uploaded, images.size);
  }

  try {
    return await api<RestoreResult>("/api/backup/restore", {
      method: "POST",
      body: manifest,
      idempotencyKey: crypto.randomUUID(),
    });
  } catch (cause) {
    // The one refusal worth translating: the ledger is append-only, so a
    // restore cannot overwrite an account that already holds data.
    if (cause instanceof ApiError && cause.status === 409) {
      throw new Error(
        "This account already holds data. Restore into a fresh install — the ledger cannot be overwritten.",
      );
    }
    throw cause;
  }
}

async function fetchImageBytes(key: string): Promise<Uint8Array> {
  const response = await fetch(`/api/images/${key}`, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("An image could not be read, so the backup was not written.");
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadImageBytes(key: string, bytes: Uint8Array): Promise<void> {
  const response = await fetch(`/api/images/${key}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "image/jpeg" },
    body: bytes as BodyInit,
  });
  // The endpoint hashes the bytes itself and rejects a mismatch, so a corrupted
  // archive is caught here rather than becoming a broken album later.
  if (!response.ok) throw new Error("An image from the backup was rejected.");
}

/** The one line that pokes the DOM. */
function saveToDisk(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
