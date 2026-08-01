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
import { cardFade, cardTilt, SWIPE_COMMIT_PX } from "../lib/swipe";
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
/** How far a thrown card tilts as it leaves. Bigger than the drag tilt: the
 *  exit is the flourish, the drag is the feedback. */
const CARD_FLY_DEG = 18;

export function StickerViewer({ stickers, index, onIndex, onClose }: StickerViewerProps) {
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
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

  /** Is there a sticker that way? */
  const canStep = (by: number) =>
    index !== null && index + by >= 0 && index + by <= stickers.length - 1;

  /** Puts a released card back where it started. */
  const settle = () => {
    if (!frame.current) return;
    if (!prefersMotion()) {
      gsap.set(frame.current, { x: 0, rotation: 0, opacity: 1 });
      return;
    }
    gsap.to(frame.current, {
      x: 0,
      rotation: 0,
      opacity: 1,
      duration: 0.35,
      ease: "elastic.out(1, 0.6)",
    });
  };

  /** Throws the card off the screen, then steps. The next one enters from the
   *  opposite edge, which is what makes the pair read as one movement. */
  const release = (by: 1 | -1) => {
    if (!frame.current || !prefersMotion()) {
      step(by);
      return;
    }
    gsap.to(frame.current, {
      x: by > 0 ? -window.innerWidth : window.innerWidth,
      rotation: by > 0 ? -CARD_FLY_DEG : CARD_FLY_DEG,
      opacity: 0,
      duration: 0.22,
      ease: "power2.in",
      onComplete: () => step(by),
    });
  };

  // The slide. It runs on a CHANGE of index, never on open — a sheet that is
  // still animating in should not also have its contents flying across it.
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (index === null || from === null || from === index) return;
    if (!frame.current || !prefersMotion()) return;

    gsap.fromTo(
      frame.current,
      {
        // `x: 0` is not decoration. The card that just left is the same node,
        // and the throw parked it at x = ±innerWidth. Setting only `xPercent`
        // here leaves that translation in place, so the entry starts on the
        // side the card flew OFF towards and slides back — which reads as the
        // next sticker arriving from the wrong edge. It only ever showed up
        // after a swipe; the arrow keys never set `x`, so they looked right.
        x: 0,
        xPercent: direction.current * 60,
        rotation: direction.current * CARD_FLY_DEG,
        autoAlpha: 0,
      },
      {
        xPercent: 0,
        x: 0,
        rotation: 0,
        autoAlpha: 1,
        opacity: 1,
        duration: 0.28,
        ease: "power2.out",
        clearProps: "transform",
      },
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div
          ref={frame}
          // `touch-action: none` on the CARD only. This is the fix for the
          // reported bug: the gesture used to sample its start and end and let
          // the browser own everything in between, so a horizontal drag
          // scrolled the album underneath while the picture sat still. Telling
          // the browser to keep its hands off *this* box — and nothing else —
          // hands the frames to the card and leaves the caption below it
          // scrolling normally.
          style={{ aspectRatio: "var(--aspect-card)", touchAction: "none" }}
          className="mx-auto w-full max-w-sm shrink-0 overflow-hidden rounded-2xl border border-border select-none"
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.pointerType === "mouse") return;
            drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
            // Captured, so a finger that leaves the card mid-drag still
            // reports to it. Without this a fast flick ends in a card stuck
            // halfway across the screen.
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
            const from = drag.current;
            if (!from || !frame.current) return;

            const dx = event.clientX - from.x;
            // At the ends of the collection the card still moves, but only a
            // quarter as far: the resistance IS the message that there is
            // nothing that way.
            const room = (dx < 0 && index === stickers.length - 1) || (dx > 0 && index === 0);
            const travelled = room ? dx * 0.25 : dx;

            gsap.set(frame.current, {
              x: travelled,
              rotation: cardTilt(travelled),
              opacity: cardFade(travelled),
            });
          }}
          onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
            const from = drag.current;
            drag.current = null;
            if (!from || !frame.current) return;

            const dx = event.clientX - from.x;
            const dy = event.clientY - from.y;
            const committed =
              Math.abs(dx) > SWIPE_COMMIT_PX &&
              Math.abs(dx) > Math.abs(dy) &&
              canStep(dx < 0 ? 1 : -1);

            if (committed) {
              // Right means "back", the way pages turn.
              release(dx < 0 ? 1 : -1);
              return;
            }

            // Snapped back, not cut back: a card that teleports home reads as
            // the app having missed the gesture.
            settle();
          }}
          onPointerCancel={() => {
            drag.current = null;
            settle();
          }}
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
