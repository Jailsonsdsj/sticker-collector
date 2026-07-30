import type { BackupManifest } from "@sticker-collector/shared";
import { BACKUP_VERSION } from "@sticker-collector/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildArchive } from "./backupArchive";
import { exportBackup, restoreBackup } from "./backupClient";

/**
 * The two orchestrations around the archive.
 *
 * What matters here is order and completeness: every image fetched before the
 * file is written, every image uploaded before any data is posted.
 */
const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;
const jpeg = (salt: number) => new Uint8Array([0xff, 0xd8, salt, salt + 1, 0xff, 0xd9]);

function manifest(over: Partial<BackupManifest> = {}): BackupManifest {
  return {
    version: BACKUP_VERSION,
    exportedAt: "2026-07-29T12:00:00.000Z",
    user: { timezone: "UTC" },
    epics: [],
    tasks: [],
    occurrences: [],
    ledger: [{ id: "l1", userId: "u1", amountCoins: 45, reason: "task_reward" }],
    albums: [{ id: "a1", userId: "u1", title: "Kitchen heroes", coverKey: key(999) }],
    stickers: [{ id: "s1", albumId: "a1", imageKey: key(1), tier: "common", slotIndex: 0 }],
    holdings: [],
    imageKeys: [key(1), key(999)],
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let saved: { bytes: Uint8Array; filename: string }[];
let calls: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const save = (bytes: Uint8Array, filename: string) => {
  saved.push({ bytes, filename });
};

beforeEach(() => {
  localStorage.clear();
  saved = [];
  calls = [];
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url === "/api/backup/manifest") return json(manifest());
    if (url === "/api/backup/restore") return json({ restored: { ledger: 1 } }, 201);
    if (url.startsWith("/api/images/")) {
      return method === "GET"
        ? new Response(jpeg(1) as unknown as BodyInit, { status: 200 })
        : json({ created: true }, 201);
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("exporting", () => {
  it("writes a file named for the day", async () => {
    const filename = await exportBackup({ today: "2026-07-29", save });

    expect(filename).toBe("sticker-collector-backup-2026-07-29.zip");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe(filename);
  });

  it("fetches every image the manifest names, exactly once", async () => {
    await exportBackup({ today: "2026-07-29", save });

    const fetched = calls.filter((call) => call.startsWith("GET /api/images/"));
    expect(fetched).toHaveLength(2);
    expect(new Set(fetched).size).toBe(2);
  });

  it("writes nothing if an image cannot be read", async () => {
    // An incomplete backup is worse than none: it looks like insurance.
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/images/") ? new Response(null, { status: 404 }) : json(manifest()),
    );

    await expect(exportBackup({ today: "2026-07-29", save })).rejects.toThrow(/could not be read/);
    expect(saved).toHaveLength(0);
  });

  it("reports progress as the images arrive", async () => {
    const seen: string[] = [];
    await exportBackup({
      today: "2026-07-29",
      save,
      onProgress: (done, total) => seen.push(`${done}/${total}`),
    });

    expect(seen).toEqual(["1/2", "2/2"]);
  });

  it("produces a file that reads back as the same account", async () => {
    await exportBackup({ today: "2026-07-29", save });

    const { parseArchive } = await import("./backupArchive");
    const back = parseArchive(saved[0]?.bytes as Uint8Array);
    expect(back.manifest).toEqual(manifest());
    expect([...back.images.keys()].sort()).toEqual([key(1), key(999)].sort());
  });
});

describe("restoring", () => {
  const archive = () =>
    buildArchive({
      manifest: manifest(),
      images: new Map([
        [key(1), jpeg(1)],
        [key(999), jpeg(2)],
      ]),
    });

  it("uploads every image before posting any data", async () => {
    // The other order leaves albums pointing at images that were never
    // uploaded — a broken account that looks complete.
    await restoreBackup({ archive: archive() });

    const uploads = calls.filter((call) => call.startsWith("PUT /api/images/"));
    const post = calls.findIndex((call) => call === "POST /api/backup/restore");

    expect(uploads).toHaveLength(2);
    for (const upload of uploads) {
      expect(calls.indexOf(upload)).toBeLessThan(post);
    }
  });

  it("posts nothing when an image is rejected", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url.startsWith("/api/images/")) return json({ error: "bad key" }, 400);
      return json({ restored: {} }, 201);
    });

    await expect(restoreBackup({ archive: archive() })).rejects.toThrow(/rejected/);
    expect(calls).not.toContain("POST /api/backup/restore");
  });

  it("explains the one refusal the ledger makes unavoidable", async () => {
    // Append-only means a restore cannot overwrite an account that has data.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/backup/restore") return json({ error: "already holds data" }, 409);
      if (url.startsWith("/api/images/") && method === "PUT") return json({}, 201);
      return json({});
    });

    await expect(restoreBackup({ archive: archive() })).rejects.toThrow(/fresh install/i);
  });

  it("refuses a file that is not a backup, before touching the network", async () => {
    await expect(
      restoreBackup({ archive: new TextEncoder().encode("not a zip") }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("reports progress as the images go up", async () => {
    const seen: string[] = [];
    await restoreBackup({
      archive: archive(),
      onProgress: (n, total) => seen.push(`${n}/${total}`),
    });
    expect(seen).toEqual(["1/2", "2/2"]);
  });
});
