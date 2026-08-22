import {
  applyPan,
  aspectFillRect,
  CENTERED,
  IMAGE_SIZES,
  type ImageKind,
  isPuzzleSize,
  type Offset,
  puzzleTarget,
  type Size,
} from "@sticker-collector/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { cropToJpeg, loadBitmap } from "../lib/canvas";
import { Button } from "./ui";

export interface ImageCropperProps {
  file: File;
  kind: ImageKind;
  /** The encoded bytes, and the size they were encoded at — a puzzle keeps
   *  its own shape, so the caller cannot infer it. */
  onCommit: (bytes: Uint8Array, size: Size) => void;
  onCancel: () => void;
  /** "Use this image" alone; "Next"/"Done" when positioning a batch. */
  commitLabel?: string;
  /** Offered only mid-batch — step back to re-position the previous image. */
  onBack?: () => void;
}

/**
 * Aspect-fill crop with drag-to-reposition (`prd/04-albums.md` §Geometry 2).
 *
 * The preview is an `<img>` with `object-fit: cover`, not a canvas. Cover *is*
 * aspect-fill, and `object-position` takes exactly the 0–1 offset the crop uses
 * — so what the user drags is the same number the export consumes, rather than
 * a second implementation of the same geometry that could drift from it. The
 * canvas appears once, at commit.
 */
export function ImageCropper({
  file,
  kind,
  onCommit,
  onCancel,
  commitLabel,
  onBack,
}: ImageCropperProps) {
  /**
   * A puzzle keeps its whole picture, so there is nothing to position: no
   * crop, no drag, and a preview shaped like the file itself.
   */
  const whole = kind === "puzzle";
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [offset, setOffset] = useState<Offset>(CENTERED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setOffset(CENTERED);

    loadBitmap(file)
      .then((loaded) => {
        if (cancelled) loaded.close();
        else setBitmap(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("That file could not be read as an image.");
      });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const pan = useCallback(
    (dx: number, dy: number) => {
      const frame = frameRef.current;
      if (!bitmap || !frame || whole) return;

      const source = { width: bitmap.width, height: bitmap.height };
      const rect = aspectFillRect(source, kind, CENTERED);
      const box = frame.getBoundingClientRect();
      // Screen pixels to source pixels: the crop maps onto the frame, so their
      // widths are the scale factor between the two coordinate systems.
      const scale = box.width === 0 ? 1 : rect.sWidth / box.width;

      setOffset((current) =>
        applyPan(
          current,
          { x: dx * scale, y: dy * scale },
          {
            width: source.width - rect.sWidth,
            height: source.height - rect.sHeight,
          },
        ),
      );
    },
    [bitmap, kind, whole],
  );

  /** Too small or too thin to cut into pieces worth looking at. */
  const tooSmall =
    whole &&
    bitmap !== null &&
    !isPuzzleSize(puzzleTarget({ width: bitmap.width, height: bitmap.height }));

  const commit = async () => {
    if (!bitmap || tooSmall) return;
    setBusy(true);
    setError(null);
    try {
      const size = whole
        ? puzzleTarget({ width: bitmap.width, height: bitmap.height })
        : IMAGE_SIZES[kind];
      onCommit(await cropToJpeg(bitmap, kind, offset), size);
    } catch {
      setError("That image could not be prepared. Try a different file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={frameRef}
        className="relative mx-auto w-full max-w-sm touch-none overflow-hidden rounded-2xl border border-border bg-panel"
        // The frame IS the preview, so it has to be the shape of what gets
        // saved: `object-fit: cover` inside it is the same aspect-fill the
        // export performs. For a puzzle nothing is cropped, so the frame takes
        // the picture's own shape and shows all of it.
        style={{
          aspectRatio: whole
            ? `${bitmap?.width ?? 1} / ${bitmap?.height ?? 1}`
            : `${IMAGE_SIZES[kind].width} / ${IMAGE_SIZES[kind].height}`,
        }}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = dragRef.current;
          if (!from) return;
          pan(event.clientX - from.x, event.clientY - from.y);
          dragRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        {preview && (
          <img
            src={preview}
            alt=""
            draggable={false}
            className={
              whole
                ? "h-full w-full select-none object-contain"
                : "h-full w-full select-none object-cover"
            }
            style={whole ? undefined : { objectPosition: `${offset.x * 100}% ${offset.y * 100}%` }}
          />
        )}
      </div>

      <p className="text-center font-body text-sm text-ink-dim">
        {whole
          ? "The whole picture is kept, at the shape it came in."
          : "Drag to reposition. The visible area is what gets saved."}
      </p>

      {tooSmall && (
        <p role="alert" className="text-center font-body text-sm text-magenta">
          That picture is too small to cut up. Pick one at least 256 pixels on its shorter side.
        </p>
      )}

      {error && (
        <p role="alert" className="text-center font-body text-sm text-magenta">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" tone="neutral" onClick={onCancel}>
          Cancel
        </Button>
        {onBack && (
          <Button variant="outline" tone="neutral" disabled={busy} onClick={onBack}>
            Back
          </Button>
        )}
        <Button tone="lime" disabled={!bitmap || busy || tooSmall} onClick={commit}>
          {busy ? "Preparing…" : (commitLabel ?? "Use this image")}
        </Button>
      </div>
    </div>
  );
}
