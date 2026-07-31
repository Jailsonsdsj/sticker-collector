import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { imageSrc } from "../../lib/imageUpload";
import { prefersMotion } from "../../lib/placement";
import { Button, ImageTile } from "../ui";

/**
 * Finishing an album — the biggest thing that happens in this app.
 *
 * The design bundle shipped a whole celebration vocabulary and nothing ever
 * used it: `celebration-rays`, `celebration-cover`, `celebration-banner`,
 * `confetti-fall` and `--shadow-celebration` sat in `tokens.css` unreferenced.
 * This is what they were for. GSAP stages them; the look is entirely those
 * tokens.
 *
 * It is **loud on purpose**. A pull is a small reward that happens often; this
 * happens once per album, after every slot has been earned, and it unlocks the
 * print export. Treating it like another toast would make the whole economy
 * feel like it led nowhere.
 */
export interface CelebrationProps {
  title: string;
  coverKey: string;
  onClose: () => void;
}

/** Enough to read as a shower without turning a phone into a slideshow. */
const CONFETTI = 18;

/** Positions computed once: a confetto's identity is where it starts. */
const CONFETTI_PIECES = Array.from({ length: CONFETTI }, (_, i) => ({
  left: Math.round((i * 100) / CONFETTI + 2),
  accent: (i % 5) + 1,
}));

export function Celebration({ title, coverKey, onClose }: CelebrationProps) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!prefersMotion()) return;

    const context = gsap.context(() => {
      gsap
        .timeline()
        .from("[data-part='cover']", {
          scale: 0.5,
          rotation: -8,
          autoAlpha: 0,
          duration: 0.7,
          ease: "back.out(1.6)",
        })
        .from("[data-part='banner']", { y: 24, autoAlpha: 0, duration: 0.4 }, "-=0.3")
        .from("[data-part='actions']", { autoAlpha: 0, duration: 0.3 }, "-=0.1");

      // Confetti is staggered rather than simultaneous: everything falling on
      // the same frame reads as one object, not as a shower.
      gsap.to("[data-part='confetto']", {
        y: () => 560,
        rotation: () => gsap.utils.random(360, 900),
        autoAlpha: 0,
        duration: 2.6,
        ease: "none",
        stagger: { each: 0.08, from: "random" },
      });
    }, root);

    return () => context.revert();
  }, []);

  return (
    <div
      ref={root}
      // A plain overlay rather than a <dialog>: the reveal dialog can still be
      // on screen when the last sticker lands, and two modals in the top layer
      // fight over focus and Escape.
      role="dialog"
      aria-modal="true"
      aria-label={`${title} is complete`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-hidden bg-scrim-modal p-6"
    >
      {/* Behind everything, turning slowly. */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-[140vmax] motion-safe:animate-celebration-rays"
        style={{ background: "var(--gradient-holo)", opacity: 0.12 }}
      />

      {CONFETTI_PIECES.map(({ left, accent }) => (
        <span
          key={left}
          data-part="confetto"
          aria-hidden
          className="pointer-events-none absolute top-0 size-2 rounded-xs"
          style={{ left: `${left}%`, background: `var(--color-epic-${accent})` }}
        />
      ))}

      <div
        data-part="cover"
        className="w-48 max-w-[55vw] overflow-hidden rounded-2xl"
        style={{ aspectRatio: "var(--aspect-card)", boxShadow: "var(--shadow-celebration)" }}
      >
        <ImageTile src={imageSrc(coverKey)} className="object-cover" loading="eager" />
      </div>

      <div data-part="banner" className="text-center">
        <p className="font-display text-4xl tracking-display uppercase italic [background:var(--gradient-holo-text)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]">
          Complete
        </p>
        <p className="mt-1 font-body text-md text-ink-secondary">
          Every slot in {title} is filled. The print sheet is ready.
        </p>
      </div>

      <div data-part="actions">
        <Button tone="lime" onClick={onClose}>
          See the album
        </Button>
      </div>
    </div>
  );
}
