import {
  aspectFillRect,
  IMAGE_SIZES,
  type ImageKind,
  JPEG_QUALITY,
  type Offset,
  puzzleTarget,
} from "@sticker-collector/shared";

/**
 * The only place a canvas is touched.
 *
 * jsdom has no canvas, so none of this can be tested in this repo — which is
 * exactly why it computes nothing. Every number it uses comes from
 * `aspectFillRect` and `IMAGE_SIZES` in `shared`, where the arithmetic is
 * tested exhaustively. What is left here is `drawImage` and `toBlob`.
 *
 * The output is **JPEG, never WebP**: `pdf-lib` can embed JPEG and PNG only, so
 * a WebP master would force the print export to re-encode 60+ images in the
 * browser (architecture.md §5).
 */
export async function cropToJpeg(
  source: ImageBitmap,
  kind: ImageKind,
  offset: Offset,
): Promise<Uint8Array> {
  const size = { width: source.width, height: source.height };

  /**
   * A puzzle is **scaled, not cropped**: the whole picture, at its own shape,
   * down to the bounding box. Cropping it to a square cut the ends off every
   * photo that was not already square, which is the one thing a picture you are
   * going to reassemble cannot afford. So the source rect is the whole bitmap
   * and there is nothing to position.
   */
  const target = kind === "puzzle" ? puzzleTarget(size) : IMAGE_SIZES[kind];
  const rect =
    kind === "puzzle"
      ? { sx: 0, sy: 0, sWidth: size.width, sHeight: size.height }
      : aspectFillRect(size, kind, offset);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    rect.sx,
    rect.sy,
    rect.sWidth,
    rect.sHeight,
    0,
    0,
    target.width,
    target.height,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) throw new Error("could not encode the image");

  return new Uint8Array(await blob.arrayBuffer());
}

/** Decodes a picked file. `createImageBitmap` respects EXIF orientation. */
export async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}
