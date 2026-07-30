import { describe, expect, it } from "vitest";
import {
  ASPECT,
  applyPan,
  aspectFillRect,
  CENTERED,
  clampOffset,
  hashFromImageKey,
  IMAGE_SIZES,
  type ImageKind,
  imageKey,
  imageKindForSize,
  isImageKey,
  panFreedom,
  type Size,
} from "./image";

const HEX = "a".repeat(64);
const size = (width: number, height: number): Size => ({ width, height });

/**
 * Whether a rect matches a kind's stored ratio to within a pixel. Compared
 * against the canonical pixel sizes, not against 5:7 — 591:827 is itself only
 * 5:7 to within rounding, and that error grows with the source.
 */
const matchesRatio = (rect: { sWidth: number; sHeight: number }, kind: ImageKind) => {
  const target = IMAGE_SIZES[kind];
  const drift = Math.abs(rect.sWidth * target.height - rect.sHeight * target.width);
  return drift <= target.height;
};

describe("the canonical sizes", () => {
  it("are both 5:7, to within the rounding 300 dpi forces", () => {
    for (const kind of ["sticker", "cover"] as const) {
      const { width, height } = IMAGE_SIZES[kind];
      // 591 x 7 = 4137 against 827 x 5 = 4135: two units of drift, not zero.
      expect(Math.abs(width * ASPECT.height - height * ASPECT.width)).toBeLessThanOrEqual(5);
    }
  });

  it("does NOT make the cover exactly three times the sticker in pixels", () => {
    // The spec says the cover "is exactly three times the sticker". That is true
    // in millimetres (50 -> 150) and false in stored pixels, because each
    // dimension is rounded from 300 dpi on its own. Pinned here because the
    // print export is the code most likely to assume the division is clean.
    expect(IMAGE_SIZES.sticker.width * 3).toBe(1773);
    expect(IMAGE_SIZES.cover.width).toBe(1772);
    expect(IMAGE_SIZES.sticker.height * 3).toBe(2481);
    expect(IMAGE_SIZES.cover.height).toBe(2480);
  });

  it("are the sizes the spec names, not approximations of them", () => {
    expect(IMAGE_SIZES.sticker).toEqual({ width: 591, height: 827 });
    expect(IMAGE_SIZES.cover).toEqual({ width: 1772, height: 2480 });
  });
});

describe("aspectFillRect", () => {
  const kinds: ImageKind[] = ["sticker", "cover"];

  it("crops the width of a source that is too wide", () => {
    // 1000×700 against 5:7 → keep the full height, take 500 of the width.
    const rect = aspectFillRect(size(1000, 700), "sticker");
    expect(rect.sHeight).toBe(700);
    expect(rect.sWidth).toBe(500);
    expect(rect.sx).toBe(250); // centred: the two discarded halves are equal
    expect(rect.sy).toBe(0);
  });

  it("crops the height of a source that is too tall", () => {
    const rect = aspectFillRect(size(500, 1000), "sticker");
    expect(rect.sWidth).toBe(500);
    expect(rect.sHeight).toBe(700);
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(150);
  });

  it("takes the whole of a source already at 5:7", () => {
    const rect = aspectFillRect(size(500, 700), "sticker");
    expect(rect).toEqual({ sx: 0, sy: 0, sWidth: 500, sHeight: 700 });
  });

  it("takes the whole of a source that is exactly the stored size", () => {
    for (const kind of kinds) {
      const { width, height } = IMAGE_SIZES[kind];
      expect(aspectFillRect(size(width, height), kind)).toEqual({
        sx: 0,
        sy: 0,
        sWidth: width,
        sHeight: height,
      });
    }
  });

  it("always fills — the crop is 5:7, so the output never has bars", () => {
    const sources = [
      size(4000, 3000),
      size(3000, 4000),
      size(1920, 1080),
      size(1080, 1920),
      size(591, 827),
      size(100, 5000),
      size(5000, 100),
      size(1, 1),
    ];
    for (const kind of kinds) {
      for (const source of sources) {
        const rect = aspectFillRect(source, kind);
        expect(matchesRatio(rect, kind)).toBe(true);
      }
    }
  });

  it("never leaves the source bitmap, at any offset", () => {
    // drawImage with a rect that overhangs the bitmap draws transparent pixels.
    // Every offset, every shape, must stay inside.
    const sources = [size(4000, 3000), size(3000, 4000), size(999, 1000), size(1, 1)];
    const offsets = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1];
    for (const kind of kinds) {
      for (const source of sources) {
        for (const x of offsets) {
          for (const y of offsets) {
            const rect = aspectFillRect(source, kind, { x, y });
            expect(rect.sx).toBeGreaterThanOrEqual(0);
            expect(rect.sy).toBeGreaterThanOrEqual(0);
            expect(rect.sx + rect.sWidth).toBeLessThanOrEqual(source.width);
            expect(rect.sy + rect.sHeight).toBeLessThanOrEqual(source.height);
          }
        }
      }
    }
  });

  it("moves the window across the overflowing axis only", () => {
    const source = size(1000, 700);
    const left = aspectFillRect(source, "sticker", { x: 0, y: 0.5 });
    const right = aspectFillRect(source, "sticker", { x: 1, y: 0.5 });

    expect(left.sx).toBe(0);
    expect(right.sx).toBe(500);
    // Height was fully consumed, so y has nowhere to travel.
    expect(left.sy).toBe(0);
    expect(right.sy).toBe(0);
  });

  it("clamps an offset that came from a runaway drag", () => {
    const source = size(1000, 700);
    expect(aspectFillRect(source, "sticker", { x: -5, y: 0.5 }).sx).toBe(0);
    expect(aspectFillRect(source, "sticker", { x: 99, y: 0.5 }).sx).toBe(500);
    expect(aspectFillRect(source, "sticker", { x: Number.NaN, y: 0.5 }).sx).toBe(250);
  });

  it("defaults to centred", () => {
    const source = size(1000, 700);
    expect(aspectFillRect(source, "sticker")).toEqual(aspectFillRect(source, "sticker", CENTERED));
  });
});

describe("panning", () => {
  it("offers freedom on the overflowing axis only", () => {
    expect(panFreedom(size(1000, 700), "sticker")).toEqual({ width: 500, height: 0 });
    expect(panFreedom(size(500, 1000), "sticker")).toEqual({ width: 0, height: 300 });
    expect(panFreedom(size(500, 700), "sticker")).toEqual({ width: 0, height: 0 });
  });

  it("moves the window opposite to the drag, so the image follows the finger", () => {
    const freedom = { width: 500, height: 0 };
    // Dragging right by 100 source px reveals what was to the left.
    expect(applyPan(CENTERED, { x: 100, y: 0 }, freedom).x).toBeCloseTo(0.3);
    expect(applyPan(CENTERED, { x: -100, y: 0 }, freedom).x).toBeCloseTo(0.7);
  });

  it("stops at the edges instead of running past them", () => {
    const freedom = { width: 500, height: 0 };
    expect(applyPan(CENTERED, { x: 10_000, y: 0 }, freedom).x).toBe(0);
    expect(applyPan(CENTERED, { x: -10_000, y: 0 }, freedom).x).toBe(1);
  });

  it("stays centred on an axis with no freedom, rather than dividing by zero", () => {
    const pinned = applyPan(CENTERED, { x: 50, y: 50 }, { width: 0, height: 0 });
    expect(pinned).toEqual({ x: 0.5, y: 0.5 });
  });

  it("survives a drag that is not a number", () => {
    const freedom = { width: 500, height: 300 };
    expect(applyPan(CENTERED, { x: Number.NaN, y: 0 }, freedom).x).toBe(0.5);
  });
});

describe("clampOffset", () => {
  it("keeps a legitimate offset untouched", () => {
    expect(clampOffset({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 });
  });

  it("pulls anything outside [0, 1] back to the edge", () => {
    expect(clampOffset({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 });
  });

  it("recentres NaN but still clamps an infinity", () => {
    // NaN means the drag arithmetic broke and has no edge to clamp to;
    // an infinite drag simply ran off one end.
    expect(clampOffset({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({
      x: 0.5,
      y: 1,
    });
    expect(clampOffset({ x: Number.NEGATIVE_INFINITY, y: 0.5 })).toEqual({ x: 0, y: 0.5 });
  });
});

describe("image keys", () => {
  it("addresses bytes by their own hash", () => {
    expect(imageKey(HEX)).toBe(`img/${HEX}.jpg`);
  });

  it("round-trips the digest", () => {
    expect(hashFromImageKey(imageKey(HEX))).toBe(HEX);
  });

  it("rejects anything that is not a content address", () => {
    // The key reaches R2 as a path, so path traversal and wrong shapes must not
    // parse — the Worker derives its own key, but nothing should look valid here
    // that would not survive the round trip.
    for (const bad of [
      "img/../secret.jpg",
      "img/nope.jpg",
      `img/${HEX}.png`,
      `img/${HEX.toUpperCase()}.jpg`,
      `img/${"a".repeat(63)}.jpg`,
      `img/${"a".repeat(65)}.jpg`,
      `${HEX}.jpg`,
      "img/",
      "",
    ]) {
      expect(isImageKey(bad)).toBe(false);
      expect(hashFromImageKey(bad)).toBeNull();
    }
  });
});

describe("imageKindForSize", () => {
  it("names the two canonical sizes", () => {
    expect(imageKindForSize({ width: 591, height: 827 })).toBe("sticker");
    expect(imageKindForSize({ width: 1772, height: 2480 })).toBe("cover");
  });

  it("refuses a size that is one pixel off", () => {
    // A near-miss is the dangerous case: it survives upload and breaks the print
    // export weeks later, where the cause is invisible.
    expect(imageKindForSize({ width: 591, height: 828 })).toBeNull();
    expect(imageKindForSize({ width: 590, height: 827 })).toBeNull();
    expect(imageKindForSize({ width: 827, height: 591 })).toBeNull();
  });
});
