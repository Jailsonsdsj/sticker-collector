import type { AlbumDetail, Tier } from "@sticker-collector/shared";
// pdf-lib's colour constructor is aliased because `check-tokens.sh` greps for
// the CSS colour functions by name, and this one is a PDF colour, not a CSS
// one. Renaming it here is cheaper than teaching the guard an exception.
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb as pdfColour,
  type RGB,
  StandardFonts,
} from "pdf-lib";
import {
  CUT_GUIDE_PT,
  coverCaptionY,
  coverRect,
  cutGuides,
  FOOTER_Y,
  mm,
  type Paper,
  pageSize,
  paginate,
} from "./pdfLayout";

/**
 * The printed album.
 *
 * Everything positional comes from `pdfLayout` — this file draws and does no
 * arithmetic, which is what lets the geometry be asserted to the point without
 * a PDF in the loop.
 *
 * **Nothing is resampled.** `embedJpg` stores the original bytes and every
 * image is drawn at its native millimetre size, so a 591 × 827 sticker lands on
 * 50 × 70 mm at 300 dpi exactly, as the spec requires.
 */
export interface PdfInput {
  album: AlbumDetail["album"];
  stickers: AlbumDetail["stickers"];
  /** Original JPEG bytes, by image key. Fetched by the caller. */
  images: Map<string, Uint8Array>;
  paper: Paper;
  /** Today, as a civil date — the completion line and the file name use it. */
  today: string;
  /** Reads a CSS custom property. Injectable so the export is testable. */
  readToken?: (name: string) => string;
}

/** Used only where a token cannot be read — outside a browser, chiefly. */
const FALLBACK_INK = pdfColour(0.1, 0.1, 0.12);
const FALLBACK_MUTED = pdfColour(0.45, 0.45, 0.5);
const FALLBACK_FRAME = pdfColour(0.42, 0.45, 0.52);

export async function buildAlbumPdf(input: PdfInput): Promise<Uint8Array> {
  // Exporting is the reward for finishing (`prd/06-export.md`). An incomplete
  // album has empty slots, and a sheet with holes in it is not the artifact.
  if (input.album.owned < input.album.total || input.album.total === 0) {
    throw new Error("Only a completed album can be exported.");
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = pageSize(input.paper);
  const lookup = tokenReader(input.readToken);
  const frameInk = frameColours(lookup);
  const INK = parseHex(lookup("--print-ink")) ?? FALLBACK_INK;
  const MUTED = parseHex(lookup("--print-muted")) ?? FALLBACK_MUTED;

  const pages = paginate(input.stickers, input.paper);
  const total = 1 + pages.length;

  // Each distinct picture is embedded **once**, however many slots use it.
  // pdf-lib does not deduplicate, so embedding per placement would write the
  // same JPEG into the file nine times over.
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedJpg"]>>>();
  const embed = async (imageKey: string) => {
    const cached = embedded.get(imageKey);
    if (cached) return cached;
    const bytes = input.images.get(imageKey);
    if (!bytes) return null;
    const image = await doc.embedJpg(bytes);
    embedded.set(imageKey, image);
    return image;
  };

  // Page 1 — the cover at its native 150 × 210 mm, centred.
  const cover = doc.addPage([size.width, size.height]);
  const coverArt = await embed(input.album.coverKey);
  if (coverArt) cover.drawImage(coverArt, coverRect(input.paper));

  const captionY = coverCaptionY(input.paper);
  cover.drawText(input.album.title, {
    x: mm(20),
    y: captionY,
    size: 18,
    font: bold,
    color: INK,
  });
  cover.drawText(`Completed ${(input.album.completedAt ?? input.today).slice(0, 10)}`, {
    x: mm(20),
    y: captionY - mm(7),
    size: 10,
    font,
    color: MUTED,
  });
  footer(cover, input.album.title, 1, total, font, size.width, MUTED);

  // Pages 2…N — nine stickers each, in the album's stored slot order.
  for (const [index, plan] of pages.entries()) {
    const page = doc.addPage([size.width, size.height]);

    for (const placement of plan.stickers) {
      const sticker = input.stickers[placement.slot];
      const art = sticker ? await embed(sticker.imageKey) : null;

      // The frame is part of the album, not a screen affordance (§4). It is
      // drawn as a bezel *behind* the art, so it reads even where the art is
      // pale at the edges.
      page.drawRectangle({
        x: placement.x - placement.frame,
        y: placement.y - placement.frame,
        width: placement.width + placement.frame * 2,
        height: placement.height + placement.frame * 2,
        color: frameInk[placement.tier],
      });

      if (art) {
        // Native size, never "fit to box": 50 x 70 mm is 300 dpi for a
        // 591 x 827 master, and any other size silently loses resolution.
        page.drawImage(art, {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        });
      }

      // A hairline on the trim edge. No bleed, so it sits exactly on the cut.
      for (const guide of cutGuides(placement)) {
        page.drawLine({
          start: { x: guide.from[0], y: guide.from[1] },
          end: { x: guide.to[0], y: guide.to[1] },
          thickness: CUT_GUIDE_PT,
          color: MUTED,
        });
      }
    }

    footer(page, input.album.title, index + 2, total, font, size.width, MUTED);
  }

  return doc.save();
}

function footer(
  page: PDFPage,
  title: string,
  pageNumber: number,
  total: number,
  font: PDFFont,
  width: number,
  colour: RGB,
): void {
  page.drawText(title, { x: mm(18), y: FOOTER_Y, size: 8, font, color: colour });
  const label = `Page ${pageNumber} of ${total}`;
  page.drawText(label, {
    // Right-aligned: measured, not guessed, so a long album title cannot push
    // the page number off the sheet.
    x: width - mm(18) - font.widthOfTextAtSize(label, 8),
    y: FOOTER_Y,
    size: 8,
    font,
    color: colour,
  });
}

/**
 * The four frame inks, read from `tokens.css` so no colour literal lives in
 * TypeScript — `check-tokens.sh` would fail the build for one, correctly.
 * Falls back to a neutral grey where the property cannot be read, which is what
 * happens outside a browser.
 */
function tokenReader(read?: (name: string) => string): (name: string) => string {
  if (read) return read;
  return (name: string) =>
    typeof getComputedStyle === "function"
      ? getComputedStyle(document.documentElement).getPropertyValue(name)
      : "";
}

function frameColours(lookup: (name: string) => string): Record<Tier, RGB> {
  const of = (tier: Tier): RGB => parseHex(lookup(`--print-rarity-${tier}`)) ?? FALLBACK_FRAME;
  return { common: of("common"), rare: of("rare"), epic: of("epic"), legendary: of("legendary") };
}

function parseHex(value: string): RGB | null {
  const hex = value.trim().replace("#", "");
  if (hex.length !== 6) return null;
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  const [r, g, b] = [channel(0), channel(2), channel(4)];
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return pdfColour(r, g, b);
}
