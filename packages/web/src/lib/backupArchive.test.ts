import type { BackupManifest } from "@sticker-collector/shared";
import { BACKUP_VERSION } from "@sticker-collector/shared";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  BackupFormatError,
  backupFileName,
  buildArchive,
  MANIFEST_ENTRY,
  parseArchive,
} from "./backupArchive";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

/** Bytes that look like a JPEG and differ from each other. */
const jpeg = (salt: number, size = 2048) =>
  new Uint8Array(Array.from({ length: size }, (_, i) => (i * 31 + salt * 7) % 251));

function manifest(over: Partial<BackupManifest> = {}): BackupManifest {
  return {
    version: BACKUP_VERSION,
    exportedAt: "2026-07-29T12:00:00.000Z",
    user: { timezone: "Europe/Lisbon" },
    epics: [{ id: "e1", userId: "u1", title: "Health", accent: "epic-2" }],
    tasks: [{ id: "t1", userId: "u1", title: "Stretch", effortMinutes: 45, weekdays: 127 }],
    occurrences: [{ id: "o1", taskId: "t1", scheduledOn: "2026-07-20", status: "done" }],
    ledger: [{ id: "l1", userId: "u1", amountCoins: 45, reason: "task_reward" }],
    albums: [{ id: "a1", userId: "u1", title: "Kitchen heroes", coverKey: key(999) }],
    stickers: [{ id: "s1", albumId: "a1", imageKey: key(1), tier: "common", slotIndex: 0 }],
    holdings: [{ id: "h1", stickerId: "s1", quantity: 2 }],
    puzzles: [],
    puzzlePieces: [],
    routineSlots: [],
    subtasks: [],
    imageKeys: [key(1), key(999)],
    ...over,
  };
}

const images = (count: number) =>
  new Map<string, Uint8Array>([
    [key(999), jpeg(0, 4096)],
    ...Array.from({ length: count }, (_, i) => [key(i + 1), jpeg(i + 1)] as const),
  ]);

describe("the round trip", () => {
  it("reproduces the manifest exactly", async () => {
    // The row's criterion. Deep equality, not a spot check: a backup that drops
    // one field is discovered months later, by someone restoring it.
    const original = manifest();
    const archive = buildArchive({ manifest: original, images: images(1) });

    expect(parseArchive(archive).manifest).toEqual(original);
  });

  it("reproduces every image byte for byte", async () => {
    const sent = images(3);
    const archive = buildArchive({ manifest: manifest(), images: sent });
    const back = parseArchive(archive).images;

    expect(back.size).toBe(sent.size);
    for (const [imageKey, bytes] of sent) {
      expect([...(back.get(imageKey) as Uint8Array)], imageKey).toEqual([...bytes]);
    }
  });

  it("survives an album at the sealed maximum", async () => {
    // 200 stickers is the cap A-03 enforces; the archive has to carry it.
    const sent = images(200);
    const archive = buildArchive({ manifest: manifest(), images: sent });
    const back = parseArchive(archive);

    expect(back.images.size).toBe(201); // 200 stickers plus the cover
    expect(back.manifest).toEqual(manifest());
  });

  it("carries an account with no images at all", async () => {
    const empty = manifest({ imageKeys: [], albums: [], stickers: [] });
    const back = parseArchive(buildArchive({ manifest: empty, images: new Map() }));

    expect(back.manifest).toEqual(empty);
    expect(back.images.size).toBe(0);
  });
});

describe("what the archive does to the images", () => {
  it("stores them rather than recompressing them", async () => {
    // A JPEG is already compressed. Re-deflating sixty of them costs seconds of
    // phone CPU to make the file slightly larger.
    const sent = images(20);
    const raw = [...sent.values()].reduce((sum, bytes) => sum + bytes.length, 0);
    const archive = buildArchive({ manifest: manifest(), images: sent });

    // Zip overhead is per-entry headers, not a multiple of the payload.
    expect(archive.length).toBeGreaterThan(raw);
    expect(archive.length).toBeLessThan(raw * 1.1 + 8192);
  });
});

describe("reading a file that is not ours", () => {
  it("rejects something that is not a zip", () => {
    expect(() => parseArchive(new TextEncoder().encode("hello"))).toThrow(BackupFormatError);
  });

  it("rejects a zip with no manifest", () => {
    const zip = zipSync({ "notes.txt": new TextEncoder().encode("nothing to see") });
    expect(() => parseArchive(zip)).toThrow(/no manifest/i);
  });

  it("rejects a manifest that is not readable JSON", () => {
    const zip = zipSync({ [MANIFEST_ENTRY]: new TextEncoder().encode("{{{") });
    expect(() => parseArchive(zip)).toThrow(/not readable/i);
  });

  it("rejects a manifest this version does not understand", () => {
    // Validated with the same schema the API uses, so a file this accepts is
    // one the server will accept — rather than finding out after uploading
    // sixty images.
    const future = JSON.stringify({ ...manifest(), version: 99 });
    const zip = zipSync({ [MANIFEST_ENTRY]: new TextEncoder().encode(future) });

    expect(() => parseArchive(zip)).toThrow(/does not understand|not a backup this version/i);
  });

  it("rejects a manifest missing a whole table", () => {
    const { ledger: _dropped, ...incomplete } = manifest();
    const zip = zipSync({
      [MANIFEST_ENTRY]: new TextEncoder().encode(JSON.stringify(incomplete)),
    });

    expect(() => parseArchive(zip)).toThrow(BackupFormatError);
  });

  it("ignores entries it does not recognise, rather than failing", () => {
    // A later version can add files without breaking this one.
    const archive = buildArchive({ manifest: manifest(), images: images(1) });
    const reopened = parseArchive(archive);

    const withExtras = zipSync({
      [MANIFEST_ENTRY]: new TextEncoder().encode(JSON.stringify(reopened.manifest)),
      "README.txt": new TextEncoder().encode("made by a later version"),
      "future/thing.bin": new Uint8Array([1, 2, 3]),
      [key(1)]: reopened.images.get(key(1)) as Uint8Array,
    });

    const back = parseArchive(withExtras);
    expect(back.manifest).toEqual(manifest());
    expect([...back.images.keys()]).toEqual([key(1)]);
  });
});

describe("the file name", () => {
  it("says what it is and when it was made", () => {
    expect(backupFileName("2026-07-29")).toBe("sticker-collector-backup-2026-07-29.zip");
  });
});
