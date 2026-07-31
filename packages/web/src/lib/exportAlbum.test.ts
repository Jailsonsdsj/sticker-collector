import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AlbumDetail, OwnedSticker } from "@sticker-collector/shared";
import { IMAGE_SIZES } from "@sticker-collector/shared";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportAlbum } from "./exportAlbum";

/**
 * The export, end to end but for the disk.
 *
 * `save` is injected so the one DOM poke stays out of the way; everything
 * before it — deduplicated fetches, the document, the file name — is real.
 */

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

/** A JPEG pdf-lib will parse: header carries the real size, bytes pass through. */
function jpeg(width: number, height: number, salt = 0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xdb,
    0x00,
    0x43,
    0x00,
    ...new Array(64).fill(0x10),
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    0xff,
    0xc4,
    0x00,
    0x1f,
    0x00,
    ...new Array(28).fill(0x00),
    0xff,
    0xda,
    0x00,
    0x0c,
    0x03,
    0x01,
    0x00,
    0x02,
    0x11,
    0x03,
    0x11,
    0x00,
    0x3f,
    0x00,
    ...new Array(48).fill((salt + 1) & 0x7f),
    0xff,
    0xd9,
  ]);
}

function album(count: number, coverKey = key(999)): AlbumDetail {
  const stickers: OwnedSticker[] = Array.from({ length: count }, (_, i) => ({
    id: `stk${i}`,
    albumId: "alb1",
    imageKey: key(i + 1),
    title: null,
    description: null,
    tier: "common",
    slotIndex: i,
    quantity: 1,
  }));
  return {
    album: {
      id: "alb1",
      title: "Kitchen heroes",
      description: null,
      coverKey,
      derivedFromAlbumId: null,
      unlockPrice: 200,
      randomPrice: 40,
      prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
      odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
      hideLocked: false,
      lockedCoverKey: null,
      unlockedAt: "2026-07-02T00:00:00Z",
      completedAt: "2026-07-20T00:00:00Z",
      sealedAt: "2026-07-01T00:00:00Z",
      createdAt: "2026-07-01T00:00:00Z",
      editionNumber: 1,
      owned: count,
      total: count,
      percent: 100,
      status: "completed",
      remaining: 0,
      almostThere: false,
      affordable: false,
    },
    stickers,
  };
}

const TOKENS = (() => {
  const candidates = [
    resolve(process.cwd(), "src/styles/tokens.css"),
    resolve(process.cwd(), "packages/web/src/styles/tokens.css"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  const css = readFileSync(path as string, "utf8");
  return (name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? "";
})();

let saved: { bytes: Uint8Array; filename: string }[];
let fetchMock: ReturnType<typeof vi.fn>;

const save = (bytes: Uint8Array, filename: string) => {
  saved.push({ bytes, filename });
};

beforeEach(() => {
  saved = [];
  // getComputedStyle in jsdom returns nothing for a custom property, so the
  // print inks are read from the file the same way `pdf.test.ts` does.
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: TOKENS }));
  fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const imageKey = (url as string).replace("/api/images/", "");
    const index = Number.parseInt(imageKey.slice(4, 68), 16);
    const size = index === 0x3e7 ? IMAGE_SIZES.cover : IMAGE_SIZES.sticker;
    return new Response(jpeg(size.width, size.height, index) as unknown as BodyInit, {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const run = (detail: AlbumDetail, paper: "a4" | "letter" = "a4") =>
  exportAlbum({ album: detail, paper, today: "2026-07-29", save });

describe("exporting a finished album", () => {
  it("saves a real PDF", async () => {
    await run(album(9));

    expect(saved).toHaveLength(1);
    const bytes = saved[0]?.bytes as Uint8Array;
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("names the file after the album and the day", async () => {
    await run(album(9));
    expect(saved[0]?.filename).toBe("sticker-collector-kitchen-heroes-2026-07-29.pdf");
  });

  it("can be run again, and again", async () => {
    // The export is the reward for finishing, and nothing limits or records it.
    const detail = album(9);
    await run(detail);
    await run(detail);
    await run(detail);

    expect(saved).toHaveLength(3);
    expect(new Set(saved.map((file) => file.filename)).size).toBe(1);
  });

  it("puts the cover and every sticker in the document", async () => {
    await run(album(12));
    const doc = await PDFDocument.load(saved[0]?.bytes as Uint8Array);
    expect(doc.getPageCount()).toBe(3); // cover + 9 + 3
  });
});

describe("fetching the pictures", () => {
  it("asks for each distinct image exactly once", async () => {
    await run(album(9));

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls).toHaveLength(10); // 9 stickers + 1 cover
    expect(new Set(urls).size).toBe(10);
  });

  it("does not re-fetch a picture two slots share", async () => {
    // A derived edition can legitimately repeat a key.
    const detail = album(4);
    for (const sticker of detail.stickers) sticker.imageKey = key(1);

    await run(detail);

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls).toHaveLength(2); // the one sticker, plus the cover
  });

  it("reports progress as they arrive", async () => {
    const seen: string[] = [];
    await exportAlbum({
      album: album(4),
      paper: "a4",
      today: "2026-07-29",
      save,
      onProgress: (done, total) => seen.push(`${done}/${total}`),
    });

    expect(seen).toEqual(["1/5", "2/5", "3/5", "4/5", "5/5"]);
  });

  it("goes through the same-origin endpoint, so the cookie authenticates it", async () => {
    await run(album(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^\/api\/images\/img\//);
    expect(init.credentials).toBe("same-origin");
  });
});

describe("when something goes wrong", () => {
  it("saves nothing if an image cannot be loaded", async () => {
    // A printed sheet with a blank square is worse than no file at all.
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));

    await expect(run(album(9))).rejects.toThrow(/could not be loaded/);
    expect(saved).toHaveLength(0);
  });

  it("saves nothing for an album that is not finished", async () => {
    const partial = album(9);
    partial.album.owned = 8;
    partial.album.percent = 88;
    partial.album.status = "in_progress";

    await expect(run(partial)).rejects.toThrow(/completed album/i);
    expect(saved).toHaveLength(0);
  });
});

describe("paper", () => {
  it("prints A4 when asked", async () => {
    await run(album(9), "a4");
    const page = (await PDFDocument.load(saved[0]?.bytes as Uint8Array)).getPage(0);
    expect(Math.round(page.getWidth() * 100) / 100).toBe(595.28);
  });

  it("prints US Letter when asked", async () => {
    // Checked on the document itself, not on the argument that was passed in.
    await run(album(9), "letter");
    const page = (await PDFDocument.load(saved[0]?.bytes as Uint8Array)).getPage(0);
    expect(Math.round(page.getWidth() * 100) / 100).toBe(612);
    expect(Math.round(page.getHeight() * 100) / 100).toBe(792);
  });
});
