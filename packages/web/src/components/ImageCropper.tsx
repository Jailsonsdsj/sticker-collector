import {
  applyPan,
  aspectFillRect,
  CENTERED,
  IMAGE_SIZES,
  type ImageKind,
  type Offset,
} from "@sticker-collector/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { cropToJpeg, loadBitmap } from "../lib/canvas";
import { Button } from "./ui";

export interface ImageCropperProps {
  file: File;
  kind: ImageKind;
  onCommit: (bytes: Uint8Array) => void;
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
      if (!bitmap || !frame) return;

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
    [bitmap, kind],
  );

  const commit = async () => {
    if (!bitmap) return;
    setBusy(true);
    setError(null);
    try {
      onCommit(await cropToJpeg(bitmap, kind, offset));
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
        // The kind's own ratio, never a literal. The frame IS the crop preview
        // — `object-fit: cover` inside it is the same aspect-fill the export
        // performs — so a frame shaped 5:7 over a square puzzle would let the
        // user position one window and ship a different one.
        style={{ aspectRatio: `${IMAGE_SIZES[kind].width} / ${IMAGE_SIZES[kind].height}` }}
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
            className="h-full w-full select-none object-cover"
            style={{ objectPosition: `${offset.x * 100}% ${offset.y * 100}%` }}
          />
        )}
      </div>

      <p className="text-center font-body text-sm text-ink-dim">
        Drag to reposition. The visible area is what gets saved.
      </p>

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
        <Button tone="lime" disabled={!bitmap || busy} onClick={commit}>
          {busy ? "Preparing…" : (commitLabel ?? "Use this image")}
        </Button>
      </div>
    </div>
  );
}
