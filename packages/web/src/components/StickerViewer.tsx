import type { OwnedSticker } from "@sticker-collector/shared";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import { imageSrc } from "../lib/imageUpload";
import { swipeDirection } from "../lib/swipe";
import { Button, ImageTile, Sheet } from "./ui";

export interface StickerViewerProps {
  /**
   * The stickers this viewer can move through — **collected ones only**.
   *
   * A locked sticker has nothing to show: its art is the thing being earned,
   * and in an album that hides locked slots it is not even downloaded. Passing
   * only what is owned is what makes "swipe to the next one" mean the next one
   * you actually have, rather than skipping past holes.
   */
  stickers: OwnedSticker[];
  /** Index into `stickers`, or null when the viewer is closed. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/**
 * One sticker, full size, with whatever the author wrote about it.
 *
 * Swiping moves between stickers **without closing** — the point is to look
 * through a collection, and a viewer that shut on every step would make that
 * eleven taps instead of one gesture. Arrow keys do the same thing, because a
 * swipe cannot be performed with a keyboard and this is the only way to read a
 * sticker's description.
 */
export function StickerViewer({ stickers, index, onIndex, onClose }: StickerViewerProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const open = index !== null && stickers.length > 0;
  const current = open ? stickers[Math.min(index, stickers.length - 1)] : undefined;

  const step = (by: number) => {
    if (index === null) return;
    // Clamped, not wrapped: running off the end of a collection should stop,
    // not silently start it again.
    const next = Math.min(Math.max(index + by, 0), stickers.length - 1);
    if (next !== index) onIndex(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current || index === null) return null;

  const title = current.title ?? `${current.tier} sticker`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      trailing={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 touch-pan-y"
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (event.pointerType === "mouse") return;
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          // Right means "back", the way pages turn.
          step(-swipeDirection(event.clientX - from.x, event.clientY - from.y));
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <div
          className="mx-auto w-full max-w-sm shrink-0 overflow-hidden rounded-2xl border border-border"
          style={{ aspectRatio: "var(--aspect-card)" }}
        >
          <ImageTile
            // Keyed so moving to the next sticker shimmers again rather than
            // showing the previous picture until the new one decodes.
            key={current.id}
            src={imageSrc(current.imageKey)}
            className="object-cover"
            loading="eager"
          />
        </div>

        {/* Title and description in ONE scrolling block, not two. A long
            description with its own scrollbar beneath a fixed title reads as
            two panels; this reads as a caption that happens to be long. */}
        {(current.title || current.description) && (
          <div className="mx-auto max-h-48 w-full max-w-sm shrink overflow-y-auto rounded-2xl border border-border bg-surface-1 p-4">
            {current.title && (
              <h3 className="font-display text-xl tracking-display text-ink uppercase italic">
                {current.title}
              </h3>
            )}
            {current.description && (
              <p className="mt-2 font-body text-md text-ink-secondary leading-relaxed">
                {current.description}
              </p>
            )}
          </div>
        )}

        <p aria-live="polite" className="text-center font-numeric text-sm text-ink-muted">
          {index + 1} of {stickers.length}
        </p>
      </div>
    </Sheet>
  );
}
