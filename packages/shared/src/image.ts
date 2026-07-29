/**
 * Image geometry, as pure arithmetic.
 *
 * Every stored image is one of exactly two sizes, sharing one 5:7 ratio, and
 * the cover is exactly three times the sticker so it lands on A5 when printed
 * (`prd/04-albums.md` §Geometry). These are the dimensions of the *stored*
 * image, not of the screen — they are identical on every device.
 *
 * The crop lives here rather than in the component because jsdom has no canvas:
 * `drawImage` and `toBlob` cannot run in any test in this repo. So the canvas
 * layer computes nothing. It calls `aspectFillRect`, passes the nine numbers
 * straight to `drawImage`, and everything that could be wrong about a crop is
 * decided by functions that are tested exhaustively here.
 */

export type ImageKind = "sticker" | "cover";

export interface Size {
  width: number;
  height: number;
}

/** Canonical stored sizes at 300 dpi: 50×70 mm and 150×210 mm (A5). */
export const IMAGE_SIZES: Record<ImageKind, Size> = {
  sticker: { width: 591, height: 827 },
  cover: { width: 1772, height: 2480 },
};

/**
 * The nominal aspect ratio, kept as two integers so no comparison needs a float.
 *
 * The stored sizes are only 5:7 to within rounding — 591 × 7 = 4137 against
 * 827 × 5 = 4135 — because each dimension is independently rounded from 300 dpi
 * (50 mm is 590.55 px, 70 mm is 826.77 px). Crops are computed against the
 * canonical pixel sizes, never against this; it exists to document the intent.
 *
 * The same rounding means **the cover is not exactly three times the sticker in
 * pixels**, though it is in millimetres: 591 × 3 = 1773 against a stored 1772,
 * and 827 × 3 = 2481 against 2480. The print export must scale from the mm, not
 * assume the pixel dimensions divide.
 */
export const ASPECT = { width: 5, height: 7 } as const;

/** JPEG quality for every stored master. Never WebP — `pdf-lib` cannot embed it. */
export const JPEG_QUALITY = 0.92;

/**
 * Where the visible window sits within the source image, per axis, as a
 * fraction of the freedom available: 0 is flush left/top, 1 is flush
 * right/bottom, 0.5 is centred. Normalised rather than in pixels so the same
 * offset means the same framing whatever the source resolution, and so a drag
 * on a 320 px preview survives being applied to a 4000 px original.
 */
export interface Offset {
  x: number;
  y: number;
}

export const CENTERED: Offset = { x: 0.5, y: 0.5 };

/** The source rectangle to copy — the first four arguments of `drawImage`. */
export interface CropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

export function clampOffset(offset: Offset): Offset {
  return { x: clamp01(offset.x), y: clamp01(offset.y) };
}

/**
 * How many source pixels the crop can travel on each axis. Exactly one axis is
 * ever non-zero: aspect-fill consumes the whole of the shorter dimension, so
 * only the overflowing one can be repositioned.
 */
export function panFreedom(source: Size, kind: ImageKind): Size {
  const rect = aspectFillRect(source, kind);
  return {
    width: Math.max(0, source.width - rect.sWidth),
    height: Math.max(0, source.height - rect.sHeight),
  };
}

/**
 * Applies a drag, measured in **source** pixels, to the current offset.
 *
 * Dragging right moves the image right, which reveals what is to its left, so
 * the window travels left — hence the subtraction. The component converts
 * screen pixels to source pixels; it does not decide direction or bounds.
 */
export function applyPan(offset: Offset, deltaSourcePx: Offset, freedom: Size): Offset {
  return clampOffset({
    x: freedom.width === 0 ? 0.5 : offset.x - deltaSourcePx.x / freedom.width,
    y: freedom.height === 0 ? 0.5 : offset.y - deltaSourcePx.y / freedom.height,
  });
}

/**
 * The largest rectangle of the target ratio that fits inside the source,
 * positioned by `offset`.
 *
 * This is **aspect-fill**: the crop always covers the full output, and the
 * overflow is discarded. Aspect-fit is not used — transparent bars look wrong
 * on a sticker (§Geometry 2).
 */
export function aspectFillRect(source: Size, kind: ImageKind, offset: Offset = CENTERED): CropRect {
  const target = IMAGE_SIZES[kind];

  // Cross-multiplied, so deciding which axis overflows never depends on a float.
  const sourceIsWider = source.width * target.height > source.height * target.width;

  const sWidth = sourceIsWider
    ? Math.round((source.height * target.width) / target.height)
    : source.width;
  const sHeight = sourceIsWider
    ? source.height
    : Math.round((source.width * target.height) / target.width);

  // No clamp to the source is needed, and adding one would be dead code: the
  // axis that was rounded is the one with room to spare, and for integer
  // dimensions the rounded value can never exceed it. `drawImage` requires the
  // rect to stay inside the bitmap, so the property is asserted directly.
  const width = sWidth;
  const height = sHeight;
  const safe = clampOffset(offset);

  return {
    sx: Math.round((source.width - width) * safe.x),
    sy: Math.round((source.height - height) * safe.y),
    sWidth: width,
    sHeight: height,
  };
}

/** `img/<sha256>.jpg` — the address is the content, so bytes at a key never change. */
export function imageKey(sha256Hex: string): string {
  return `img/${sha256Hex}.jpg`;
}

const KEY_PATTERN = /^img\/[0-9a-f]{64}\.jpg$/;

export function isImageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** The hex digest a key claims to address, or `null` if it is not a key at all. */
export function hashFromImageKey(key: string): string | null {
  return isImageKey(key) ? (key.slice(4, 68) as string) : null;
}

/** Whether a decoded image is exactly one of the two canonical sizes. */
export function imageKindForSize(size: Size): ImageKind | null {
  for (const kind of ["sticker", "cover"] as const) {
    const canonical = IMAGE_SIZES[kind];
    if (size.width === canonical.width && size.height === canonical.height) return kind;
  }
  return null;
}

function clamp01(value: number): number {
  // NaN has no edge to clamp to — it means the drag arithmetic went wrong, and
  // recentring is the only sane recovery. ±Infinity does have an edge.
  if (Number.isNaN(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}
