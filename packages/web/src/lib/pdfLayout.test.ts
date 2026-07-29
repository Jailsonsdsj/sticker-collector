import { IMAGE_SIZES } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  COVER_MM,
  CUT_GUIDE_PT,
  coverRect,
  cutGuides,
  exportFileName,
  FRAME_MM,
  GUTTER_MM,
  gridMargins,
  MM_TO_PT,
  mm,
  PAPER_MM,
  type Paper,
  PER_PAGE,
  pageCount,
  pageSize,
  paginate,
  ROWS,
  STICKER_MM,
  stickerSlots,
} from "./pdfLayout";

/**
 * Point-level geometry.
 *
 * Every number here is checked against `architecture.md` §10, which states the
 * millimetres and their point equivalents once so nobody has to rediscover
 * them. Two decimal places is the tolerance §10 itself uses.
 */
const pt = (value: number) => Math.round(value * 100) / 100;
const PAPERS: Paper[] = ["a4", "letter"];

describe("the conversion §10 fixes", () => {
  it("is 1 mm = 2.834645669 pt", () => {
    expect(MM_TO_PT).toBe(2.834645669);
    expect(pt(mm(1))).toBe(2.83);
  });

  it("gives the page sizes §10 lists", () => {
    expect(pt(pageSize("a4").width)).toBe(595.28);
    expect(pt(pageSize("a4").height)).toBe(841.89);
    expect(pt(pageSize("letter").width)).toBe(612);
    expect(pt(pageSize("letter").height)).toBe(792);
  });

  it("gives the sticker and cover sizes §10 lists", () => {
    expect(pt(mm(STICKER_MM.width))).toBe(141.73);
    expect(pt(mm(STICKER_MM.height))).toBe(198.43);
    expect(pt(mm(COVER_MM.width))).toBe(425.2);
    expect(pt(mm(COVER_MM.height))).toBe(595.28);
    expect(pt(mm(GUTTER_MM))).toBe(34.02);
  });

  it("keeps the cover three times the sticker — in millimetres", () => {
    // In *pixels* it is not: 591 x 3 is 1773 against a stored 1772. Deriving
    // the layout from those would be a fraction of a millimetre out per
    // sticker, and the sheet would stop tiling.
    expect(COVER_MM.width).toBe(STICKER_MM.width * 3);
    expect(COVER_MM.height).toBe(STICKER_MM.height * 3);
    expect(IMAGE_SIZES.sticker.width * 3).not.toBe(IMAGE_SIZES.cover.width);
  });
});

describe("the 3x3 grid", () => {
  it("leaves the margins §10 calculates", () => {
    // A4: (210-174)/2 = 18 and (297-234)/2 = 31.5.
    expect(gridMargins("a4")).toEqual({ x: 18, y: 31.5 });
    // Letter: (215.9-174)/2 = 20.95 and (279.4-234)/2 = 22.7.
    const letter = gridMargins("letter");
    expect(pt(letter.x)).toBe(20.95);
    expect(pt(letter.y)).toBe(22.7);
  });

  it("fits on both papers without scaling, which is what preserves 300 dpi", () => {
    for (const paper of PAPERS) {
      const margin = gridMargins(paper);
      expect(margin.x).toBeGreaterThan(0);
      expect(margin.y).toBeGreaterThan(0);
    }
  });

  it("places nine stickers, in reading order", () => {
    const slots = stickerSlots("a4");
    expect(slots).toHaveLength(PER_PAGE);
    expect(COLUMNS * ROWS).toBe(9);

    // Left to right: each column is one sticker plus one gutter further along.
    expect(pt(slots[0]?.x as number)).toBe(pt(mm(18)));
    expect(pt(slots[1]?.x as number)).toBe(pt(mm(18 + 50 + 12)));
    expect(pt(slots[2]?.x as number)).toBe(pt(mm(18 + 2 * (50 + 12))));

    // Top to bottom, in PDF coordinates that run upwards from the bottom-left:
    // the first row sits highest.
    expect(slots[0]?.y).toBeGreaterThan(slots[3]?.y as number);
    expect(slots[3]?.y).toBeGreaterThan(slots[6]?.y as number);
  });

  it("puts the top row exactly one top-margin below the page edge", () => {
    for (const paper of PAPERS) {
      const page = PAPER_MM[paper];
      const margin = gridMargins(paper);
      const top = stickerSlots(paper)[0] as { y: number; height: number };
      expect(pt(top.y + top.height)).toBe(pt(mm(page.height - margin.y)));
    }
  });

  it("gives every sticker the same native size", () => {
    for (const paper of PAPERS) {
      for (const slot of stickerSlots(paper)) {
        expect(pt(slot.width)).toBe(141.73);
        expect(pt(slot.height)).toBe(198.43);
      }
    }
  });

  it("separates neighbours by exactly one gutter", () => {
    const slots = stickerSlots("a4");
    const first = slots[0] as { x: number; width: number };
    const second = slots[1] as { x: number };
    expect(pt(second.x - (first.x + first.width))).toBe(pt(mm(GUTTER_MM)));

    const below = slots[3] as { y: number; height: number };
    expect(pt((slots[0] as { y: number }).y - (below.y + below.height))).toBe(pt(mm(GUTTER_MM)));
  });

  it("stays inside the page on both papers", () => {
    for (const paper of PAPERS) {
      const page = pageSize(paper);
      for (const slot of stickerSlots(paper)) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(pt(slot.x + slot.width)).toBeLessThanOrEqual(pt(page.width));
        expect(pt(slot.y + slot.height)).toBeLessThanOrEqual(pt(page.height));
      }
    }
  });
});

describe("the cover page", () => {
  it("prints at its native size, centred", () => {
    for (const paper of PAPERS) {
      const page = PAPER_MM[paper];
      const cover = coverRect(paper);
      expect(pt(cover.width)).toBe(425.2);
      expect(pt(cover.height)).toBe(595.28);
      expect(pt(cover.x)).toBe(pt(mm((page.width - COVER_MM.width) / 2)));
      expect(pt(cover.y)).toBe(pt(mm((page.height - COVER_MM.height) / 2)));
    }
  });

  it("leaves room beneath it for the title and the date", () => {
    for (const paper of PAPERS) {
      expect(coverRect(paper).y).toBeGreaterThan(mm(12));
    }
  });
});

describe("pagination", () => {
  it("is the cover plus one page per nine stickers", () => {
    expect(pageCount(1)).toBe(2);
    expect(pageCount(9)).toBe(2);
    expect(pageCount(10)).toBe(3);
    expect(pageCount(60)).toBe(8);
  });

  it("keeps the album's stored order across the page break", () => {
    // The slot order was shuffled once, at seal. The printed sheet matches the
    // grid on screen because nothing re-sorts it here.
    const stickers = Array.from({ length: 12 }, () => ({ tier: "common" as const }));
    const pages = paginate(stickers, "a4");

    expect(pages).toHaveLength(2);
    expect(pages[0]?.stickers.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pages[1]?.stickers.map((s) => s.slot)).toEqual([9, 10, 11]);
  });

  it("starts a short last page at the top left", () => {
    const stickers = Array.from({ length: 10 }, () => ({ tier: "common" as const }));
    const pages = paginate(stickers, "a4");
    const first = stickerSlots("a4")[0] as { x: number; y: number };

    expect(pages[1]?.stickers[0]?.x).toBe(first.x);
    expect(pages[1]?.stickers[0]?.y).toBe(first.y);
  });

  it("carries each sticker's own frame width", () => {
    const pages = paginate(
      [{ tier: "common" }, { tier: "legendary" }, { tier: "epic" }, { tier: "rare" }],
      "a4",
    );
    const widths = pages[0]?.stickers.map((s) => s.frame) as number[];

    expect(widths[0]).toBe(mm(FRAME_MM.common));
    expect(widths[1]).toBe(mm(FRAME_MM.legendary));
    expect(new Set(widths).size).toBe(4);
    expect(widths[1]).toBeGreaterThan(widths[0] as number);
  });

  it("has no pages at all for an empty album", () => {
    expect(paginate([], "a4")).toEqual([]);
  });
});

describe("cut guides", () => {
  it("are drawn on the trim edge, with no bleed", () => {
    const rect = { x: 10, y: 20, width: 100, height: 200 };
    const guides = cutGuides(rect);

    expect(guides).toHaveLength(4);
    // Bottom edge, exactly on the boundary.
    expect(guides[0]).toEqual({ from: [10, 20], to: [110, 20] });
    // Top edge.
    expect(guides[1]).toEqual({ from: [10, 220], to: [110, 220] });
  });

  it("are hairlines", () => {
    expect(CUT_GUIDE_PT).toBe(0.25);
  });
});

describe("the file name", () => {
  it("is sticker-collector-{slug}-{date}.pdf", () => {
    expect(exportFileName("Kitchen heroes", "2026-07-29")).toBe(
      "sticker-collector-kitchen-heroes-2026-07-29.pdf",
    );
  });

  it("survives punctuation, accents and spacing", () => {
    expect(exportFileName("  Café  Crème!! ", "2026-01-02")).toBe(
      "sticker-collector-cafe-creme-2026-01-02.pdf",
    );
  });

  it("still produces a name when the title slugs to nothing", () => {
    expect(exportFileName("???", "2026-01-02")).toBe("sticker-collector-album-2026-01-02.pdf");
  });
});
