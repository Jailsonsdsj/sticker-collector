import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AlbumDetail, OwnedSticker, Tier } from "@sticker-collector/shared";
import { IMAGE_SIZES } from "@sticker-collector/shared";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildAlbumPdf } from "./pdf";
import { mm, type Paper, STICKER_MM } from "./pdfLayout";

/**
 * The document itself.
 *
 * The geometry is proven in `pdfLayout.test.ts`; what is checked here is that
 * the right numbers reach pdf-lib — page count, page size, and above all that
 * the images go in **unresampled**.
 */

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

/**
 * A JPEG that pdf-lib will actually parse: SOI, a frame header carrying the
 * real dimensions, minimal scan data, EOI. Nothing decodes it here — pdf-lib
 * reads the header to learn the size and embeds the bytes as they are, which is
 * exactly the property under test.
 */
function jpeg(width: number, height: number, salt = 0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
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
    0x00, // APP0/JFIF
    0xff,
    0xdb,
    0x00,
    0x43,
    0x00,
    ...new Array(64).fill(0x10), // DQT
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
    0x01, // SOF0
    0xff,
    0xc4,
    0x00,
    0x1f,
    0x00,
    ...new Array(28).fill(0x00), // DHT
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
    0x00, // SOS
    // Salt: distinct pictures must be distinct bytes, or "embedded once" and
    // "embedded nine times" would produce identical files.
    ...new Array(48).fill((salt + 1) & 0x7f),
    0xff,
    0xd9, // EOI
  ]);
}

const COVER_JPEG = jpeg(IMAGE_SIZES.cover.width, IMAGE_SIZES.cover.height);

function album(count: number, tier: Tier = "common"): AlbumDetail {
  const stickers: OwnedSticker[] = Array.from({ length: count }, (_, i) => ({
    id: `stk${i}`,
    albumId: "alb1",
    imageKey: key(i + 1),
    tier,
    slotIndex: i,
    quantity: 1,
  }));

  return {
    album: {
      id: "alb1",
      title: "Kitchen heroes",
      description: null,
      coverKey: key(999),
      derivedFromAlbumId: null,
      unlockPrice: 200,
      randomPrice: 40,
      prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
      odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
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

function images(detail: AlbumDetail): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>([[detail.album.coverKey, COVER_JPEG]]);
  for (const [index, sticker] of detail.stickers.entries()) {
    map.set(
      sticker.imageKey,
      map.get(sticker.imageKey) ??
        jpeg(IMAGE_SIZES.sticker.width, IMAGE_SIZES.sticker.height, index),
    );
  }
  return map;
}

/**
 * The real print palette, read from `tokens.css`.
 *
 * No colour literal lives in TypeScript — `check-tokens.sh` fails the build for
 * one, correctly — and reading the file also proves the four frame tokens and
 * the two ink tokens still exist under the names `pdf.ts` asks for.
 */
const TOKENS = (() => {
  const candidates = [
    resolve(process.cwd(), "src/styles/tokens.css"),
    resolve(process.cwd(), "packages/web/src/styles/tokens.css"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  const css = readFileSync(path as string, "utf8");
  return (name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? "";
})();

const build = (detail: AlbumDetail, paper: Paper = "a4") =>
  buildAlbumPdf({
    album: detail.album,
    stickers: detail.stickers,
    images: images(detail),
    paper,
    today: "2026-07-29",
    readToken: TOKENS,
  });

describe("the document", () => {
  it("is a cover page plus one page per nine stickers", async () => {
    const doc = await PDFDocument.load(await build(album(12)));
    expect(doc.getPageCount()).toBe(3); // cover + 9 + 3
  });

  it("is one page of stickers for a nine-sticker album", async () => {
    const doc = await PDFDocument.load(await build(album(9)));
    expect(doc.getPageCount()).toBe(2);
  });

  it("uses the paper it was asked for", async () => {
    const a4 = await PDFDocument.load(await build(album(9), "a4"));
    const letter = await PDFDocument.load(await build(album(9), "letter"));

    for (const page of a4.getPages()) {
      expect(Math.round(page.getWidth() * 100) / 100).toBe(595.28);
      expect(Math.round(page.getHeight() * 100) / 100).toBe(841.89);
    }
    for (const page of letter.getPages()) {
      expect(Math.round(page.getWidth() * 100) / 100).toBe(612);
      expect(Math.round(page.getHeight() * 100) / 100).toBe(792);
    }
  });

  it("is a real PDF", async () => {
    const bytes = await build(album(9));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("images go in unresampled", () => {
  it("draws a sticker at exactly 50 x 70 mm, which is 300 dpi for 591 x 827", async () => {
    // 591 px across 50 mm is 591 / (50 / 25.4) = 300.2 dpi. Scaling the image
    // "to fit" anything else is what would quietly lose the resolution.
    const drawn = mm(STICKER_MM.width);
    const dpi = IMAGE_SIZES.sticker.width / (STICKER_MM.width / 25.4);

    expect(Math.round(drawn * 100) / 100).toBe(141.73);
    expect(Math.round(dpi)).toBe(300);
  });

  it("embeds each distinct image once, not once per placement", async () => {
    // Nine stickers sharing one picture must not become nine copies of the
    // bytes — pdf-lib reuses an embedded image, and the file size shows it.
    const shared = album(9);
    for (const sticker of shared.stickers) sticker.imageKey = key(1);

    const oneImage = await build(shared);
    const nineImages = await build(album(9));

    expect(oneImage.byteLength).toBeLessThan(nineImages.byteLength);
  });

  it("carries the original bytes through", async () => {
    // The JPEG's own scan data appears verbatim in the PDF: it was stored, not
    // re-encoded.
    const bytes = await build(album(1));
    const detail = album(1);
    const needle = (images(detail).get(detail.stickers[0]?.imageKey as string) as Uint8Array).slice(
      -16,
    );
    expect(indexOfBytes(bytes, needle)).toBeGreaterThan(-1);
  });
});

describe("what it refuses to print", () => {
  it("will not export an album with an empty slot", async () => {
    // The export is the reward for finishing; a sheet with holes is not it.
    const partial = album(9);
    partial.album.owned = 8;
    partial.album.percent = 88;
    partial.album.status = "in_progress";

    await expect(build(partial)).rejects.toThrow(/completed album/i);
  });

  it("will not export an album with no stickers", async () => {
    await expect(build(album(0))).rejects.toThrow(/completed album/i);
  });
});

describe("when an image is missing", () => {
  it("still produces the sheet, with the frame and the cut guides", async () => {
    // A missing byte array is a failed fetch, not a reason to lose the export.
    const detail = album(9);
    const partial = images(detail);
    partial.delete(detail.stickers[0]?.imageKey as string);

    const bytes = await buildAlbumPdf({
      album: detail.album,
      stickers: detail.stickers,
      images: partial,
      paper: "a4",
      today: "2026-07-29",
      readToken: TOKENS,
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("falls back to a neutral frame when the tokens cannot be read", async () => {
    const detail = album(4, "legendary");
    const bytes = await buildAlbumPdf({
      album: detail.album,
      stickers: detail.stickers,
      images: images(detail),
      paper: "a4",
      today: "2026-07-29",
      readToken: () => "",
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

describe("the print palette", () => {
  it("is defined in tokens.css, under the names pdf.ts asks for", () => {
    // If a token is renamed, the export silently falls back to grey and every
    // rarity frame prints the same. This is what notices.
    for (const tier of ["common", "rare", "epic", "legendary"] as Tier[]) {
      expect(TOKENS(`--print-rarity-${tier}`), `--print-rarity-${tier}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(TOKENS("--print-ink")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TOKENS("--print-muted")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("gives every tier its own ink", () => {
    const inks = (["common", "rare", "epic", "legendary"] as Tier[]).map((tier) =>
      TOKENS(`--print-rarity-${tier}`),
    );
    expect(new Set(inks).size).toBe(4);
  });
});
