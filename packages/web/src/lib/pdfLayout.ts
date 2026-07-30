import type { Tier } from "@sticker-collector/shared";

/**
 * Where everything sits on the printed page, in points.
 *
 * All of it derives from **millimetres**, never from the stored pixel sizes.
 * That matters more than it looks: the cover is exactly three times the sticker
 * in millimetres (50 → 150) and *not* in pixels — 591 × 3 is 1773 against a
 * stored 1772 — because each pixel dimension was rounded from 300 dpi on its
 * own. A layout derived from pixels would be a fraction of a millimetre out on
 * every sticker and would not tile.
 *
 * Pure arithmetic, so the positions can be asserted to the point. `pdf.ts` does
 * nothing but hand these numbers to pdf-lib.
 */
export const MM_TO_PT = 2.834645669;

export const mm = (millimetres: number): number => millimetres * MM_TO_PT;

export type Paper = "a4" | "letter";

export interface Size {
  width: number;
  height: number;
}

/** Page sizes in millimetres (`architecture.md` §10). */
export const PAPER_MM: Record<Paper, Size> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

/** The album's own geometry, also in millimetres. */
export const STICKER_MM: Size = { width: 50, height: 70 };
export const COVER_MM: Size = { width: 150, height: 210 };
export const GUTTER_MM = 12;

export const COLUMNS = 3;
export const ROWS = 3;
export const PER_PAGE = COLUMNS * ROWS;

/** 0.25 pt, on the trim edge. There is no bleed (`prd/06-export.md` §5). */
export const CUT_GUIDE_PT = 0.25;

/**
 * The printed frame, in millimetres, widening with rarity.
 *
 * The screen bezel is 4–7 px, which at sticker scale is about a third of a
 * millimetre — invisible on paper. These are the print equivalents: the same
 * intent (rarer reads heavier), at a size a printer can actually render.
 */
export const FRAME_MM: Record<Tier, number> = {
  common: 0.8,
  rare: 1.2,
  epic: 1.6,
  legendary: 2,
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StickerPlacement extends Rect {
  /** Index into the album's slot order — page layout never reorders. */
  slot: number;
  tier: Tier;
  frame: number;
}

export function pageSize(paper: Paper): Size {
  const size = PAPER_MM[paper];
  return { width: mm(size.width), height: mm(size.height) };
}

/**
 * The 3×3 block, centred on the page.
 *
 * 3 × 50 + 2 × 12 = 174 mm wide and 3 × 70 + 2 × 12 = 234 mm tall. On A4 that
 * leaves 18 mm at the sides and 31.5 mm top and bottom; on Letter, 20.95 and
 * 22.7. Both fit without scaling, which is what preserves 300 dpi.
 */
export function gridMargins(paper: Paper): { x: number; y: number } {
  const page = PAPER_MM[paper];
  const gridWidth = COLUMNS * STICKER_MM.width + (COLUMNS - 1) * GUTTER_MM;
  const gridHeight = ROWS * STICKER_MM.height + (ROWS - 1) * GUTTER_MM;
  return {
    x: (page.width - gridWidth) / 2,
    y: (page.height - gridHeight) / 2,
  };
}

/**
 * Where the nine stickers of one page go.
 *
 * PDF coordinates run from the bottom-left, so row 0 — the top row on paper —
 * has the largest `y`. Reading order is left to right, top to bottom, matching
 * the stored slot order.
 */
export function stickerSlots(paper: Paper): Rect[] {
  const margin = gridMargins(paper);
  const page = PAPER_MM[paper];
  const slots: Rect[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const leftMm = margin.x + column * (STICKER_MM.width + GUTTER_MM);
      const topMm = margin.y + row * (STICKER_MM.height + GUTTER_MM);
      slots.push({
        x: mm(leftMm),
        y: mm(page.height - topMm - STICKER_MM.height),
        width: mm(STICKER_MM.width),
        height: mm(STICKER_MM.height),
      });
    }
  }

  return slots;
}

/** The cover, at its native size, centred (`prd/06-export.md` §2). */
export function coverRect(paper: Paper): Rect {
  const page = PAPER_MM[paper];
  return {
    x: mm((page.width - COVER_MM.width) / 2),
    y: mm((page.height - COVER_MM.height) / 2),
    width: mm(COVER_MM.width),
    height: mm(COVER_MM.height),
  };
}

/** Baseline for the title and completion date, in the margin beneath the cover. */
export function coverCaptionY(paper: Paper): number {
  const cover = coverRect(paper);
  return cover.y - mm(10);
}

/**
 * Baseline for the footer — album title on the left, page N of M on the right.
 * 10 mm up on both papers: the bottom margin is 31.5 mm on A4 and 22.7 on
 * Letter, so it clears the grid either way.
 */
export const FOOTER_Y = mm(10);

export interface PagePlan {
  /** Stickers on this page, already positioned. */
  stickers: StickerPlacement[];
}

/**
 * Splits the album into printed pages, nine at a time, in stored slot order.
 *
 * The order is the album's own — shuffled once at seal and never re-rolled —
 * so the printed sheet matches the grid on screen.
 */
export function paginate(stickers: { tier: Tier }[], paper: Paper): PagePlan[] {
  const slots = stickerSlots(paper);
  const pages: PagePlan[] = [];

  for (let start = 0; start < stickers.length; start += PER_PAGE) {
    const batch = stickers.slice(start, start + PER_PAGE);
    pages.push({
      stickers: batch.map((sticker, index) => ({
        ...(slots[index] as Rect),
        slot: start + index,
        tier: sticker.tier,
        frame: mm(FRAME_MM[sticker.tier]),
      })),
    });
  }

  return pages;
}

/** Total pages in the document: the cover, plus one per nine stickers. */
export function pageCount(stickerCount: number): number {
  return 1 + Math.ceil(stickerCount / PER_PAGE);
}

/**
 * The four cut guides of one sticker, as line segments on its trim edge.
 * No bleed, so the guide sits exactly on the boundary of the printed sticker.
 */
export function cutGuides(rect: Rect): { from: [number, number]; to: [number, number] }[] {
  const right = rect.x + rect.width;
  const top = rect.y + rect.height;
  return [
    { from: [rect.x, rect.y], to: [right, rect.y] },
    { from: [rect.x, top], to: [right, top] },
    { from: [rect.x, rect.y], to: [rect.x, top] },
    { from: [right, rect.y], to: [right, top] },
  ];
}

/**
 * `sticker-collector-{album-slug}-{yyyy-mm-dd}.pdf` (`prd/06-export.md` §8).
 * The date is the day the file is made, in the user's own calendar.
 */
export function exportFileName(title: string, today: string): string {
  return `sticker-collector-${slugify(title)}-${today}.pdf`;
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "album";
}
