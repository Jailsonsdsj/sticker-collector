import type { OwnedSticker } from "@sticker-collector/shared";
import gsap from "gsap";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { imageSrc } from "../lib/imageUpload";
import { prefersMotion } from "../lib/placement";
import { saveSticker } from "../lib/saveImage";
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
  const frame = useRef<HTMLDivElement>(null);
  // Which way the last step went, so the new sticker enters from the side the
  // old one left towards. Without it every change slides in from the same
  // edge, and "back" feels identical to "next".
  const direction = useRef(1);
  const previous = useRef(index);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = index !== null && stickers.length > 0;
  const current = open ? stickers[Math.min(index, stickers.length - 1)] : undefined;

  const step = (by: number) => {
    if (index === null) return;
    // Clamped, not wrapped: running off the end of a collection should stop,
    // not silently start it again.
    const next = Math.min(Math.max(index + by, 0), stickers.length - 1);
    if (next !== index) {
      direction.current = by > 0 ? 1 : -1;
      onIndex(next);
    }
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

  // The slide. It runs on a CHANGE of index, never on open — a sheet that is
  // still animating in should not also have its contents flying across it.
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (index === null || from === null || from === index) return;
    if (!frame.current || !prefersMotion()) return;

    gsap.fromTo(
      frame.current,
      { xPercent: direction.current * 60, autoAlpha: 0 },
      { xPercent: 0, autoAlpha: 1, duration: 0.28, ease: "power2.out", clearProps: "transform" },
    );
  }, [index]);

  const save = async () => {
    if (!current || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      await saveSticker(current.imageKey, current.title);
    } catch {
      setFailed("The image could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!current || index === null) return null;

  const title = current.title ?? `${current.tier} sticker`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      leading={
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          disabled={saving}
          // Icon only, so the name has to come from here — otherwise the
          // button is announced as "button" and a keyboard or screen-reader
          // user has no idea what it does.
          aria-label="Save image to this device"
          onClick={() => void save()}
        >
          <DownloadIcon />
        </Button>
      }
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
          ref={frame}
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

        {failed && (
          <p role="alert" className="text-center font-body text-sm text-magenta">
            {failed}
          </p>
        )}

        <p aria-live="polite" className="text-center font-numeric text-sm text-ink-muted">
          {index + 1} of {stickers.length}
        </p>
      </div>
    </Sheet>
  );
}

/** Arrow into a tray — the download glyph, drawn rather than imported so the
 *  app keeps its single-file-per-icon-free rule and ships no icon font. */
function DownloadIcon() {
  return (
    <svg
      // Explicitly "true": the lint rule that demands a <title> accepts the
      // string form only, and a decorative glyph next to a labelled button
      // should stay out of the accessibility tree.
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}
