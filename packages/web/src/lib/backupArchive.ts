import type { BackupManifest } from "@sticker-collector/shared";
import { backupManifestSchema } from "@sticker-collector/shared";
import { unzipSync, zipSync } from "fflate";

/**
 * The backup file: one zip holding the data and every image it references.
 *
 * The images are the half that cannot be recreated — originals are discarded on
 * import — so a data-only export is not a backup (`architecture.md` §9).
 *
 * Each image is stored at **its own key path** inside the zip (`img/<sha>.jpg`),
 * so parsing reconstructs the keys directly rather than through a naming
 * convention that could drift from the manifest.
 */
export const MANIFEST_ENTRY = "manifest.json";

export interface ArchiveContents {
  manifest: BackupManifest;
  /** Original JPEG bytes, by image key. */
  images: Map<string, Uint8Array>;
}

export function buildArchive({ manifest, images }: ArchiveContents): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 9 }]> = {
    // JSON compresses well and is small enough that level 9 costs nothing.
    [MANIFEST_ENTRY]: [new TextEncoder().encode(JSON.stringify(manifest, null, 2)), { level: 9 }],
  };

  for (const [key, bytes] of images) {
    // Stored, not deflated. A JPEG is already compressed: re-deflating sixty of
    // them costs seconds of phone CPU to make the file very slightly larger.
    entries[key] = [bytes, { level: 0 }];
  }

  return zipSync(entries, { level: 0 });
}

export class BackupFormatError extends Error {}

/**
 * Reads a backup file back.
 *
 * The manifest is validated with the **same schema the API validates it with**,
 * so a file this accepts is a file the server will accept — the alternative is
 * discovering the problem after uploading sixty images.
 */
export function parseArchive(bytes: Uint8Array): ArchiveContents {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupFormatError("That file is not a backup archive.");
  }

  const manifestBytes = files[MANIFEST_ENTRY];
  if (!manifestBytes) {
    throw new BackupFormatError("That archive has no manifest.json in it.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new BackupFormatError("The manifest in that archive is not readable.");
  }

  const manifest = backupManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    throw new BackupFormatError("That manifest is not a backup this version understands.");
  }

  const images = new Map<string, Uint8Array>();
  for (const [name, content] of Object.entries(files)) {
    // Anything that is not the manifest and not an image key is ignored rather
    // than fatal, so a future version can add entries without breaking this one.
    if (name === MANIFEST_ENTRY) continue;
    if (!name.startsWith("img/")) continue;
    images.set(name, content);
  }

  return { manifest: manifest.data, images };
}

/** `sticker-collector-backup-{yyyy-mm-dd}.zip` — the user's own calendar day. */
export function backupFileName(today: string): string {
  return `sticker-collector-backup-${today}.zip`;
}
