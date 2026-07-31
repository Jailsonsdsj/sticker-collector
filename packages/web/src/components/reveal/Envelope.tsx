import type { Tier } from "@sticker-collector/shared";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { imageSrc } from "../../lib/imageUpload";
import { FLOURISH } from "../../lib/rarity";
import { Badge } from "../ui";
import { cx } from "../ui/cx";

/**
 * The envelope a pull arrives in, and the sticker coming out of it.
 *
 * The design bundle shipped this vocabulary and nothing ever used it:
 * `pack-shake` with a per-rarity duration, `burst-ring`, `flash-bloom` and a
 * looping `legend-glow` sat in `tokens.css` unreferenced. The colours, easing
 * and glows below are all those tokens — GSAP supplies only the *sequencing*,
 * which is the part keyframes handle badly: a shake whose length depends on the
 * tier, then a flap, then a card sliding out, each waiting on the last.
 *
 * **How much show a tier gets is the whole point.** A common is a shake and a
 * card. A legendary is a longer shake, a burst ring, a bloom, and a shine that
 * keeps going while you look at it. If they arrived the same way the rarity
 * would be a label rather than a feeling.
 */
export interface EnvelopeProps {
  tier: Tier;
  imageKey: string | null;
  /** Copies held after this pull. Shown only when it is more than one. */
  quantity?: number;
  /** Held open until this is called — the sticker waits for the user. */
  onOpened: () => void;
}

/**
 * The shake's share of the reveal, per tier. Matches `--duration-shake-*`.
 *
 * These set the *shape* — a legendary spends proportionally longer struggling
 * to stay shut — while `REVEAL_MS` sets how long the whole thing takes.
 */
export const SHAKE_MS: Record<Tier, number> = {
  common: 560,
  rare: 680,
  epic: 820,
  legendary: 1000,
};

/**
 * How long the whole reveal lasts, per tier.
 *
 * The choreography below is written at whatever length reads well as a
 * sequence; the timeline is then stretched to hit these numbers, so changing
 * the pace is one table rather than a dozen durations that have to stay in
 * proportion by hand.
 *
 * Two seconds for a common. The first version ran in about 1.2s, which was
 * over before the eye had settled on it; three turned out to be a wait. Two is
 * long enough to be a beat and short enough to roll again.
 *
 * The ladder above it stays: a legendary should still not arrive at the same
 * speed as a common.
 */
export const REVEAL_MS: Record<Tier, number> = {
  common: 2000,
  rare: 2200,
  epic: 2400,
  legendary: 2700,
};

export function Envelope({ tier, imageKey, quantity = 1, onOpened }: EnvelopeProps) {
  const root = useRef<HTMLDivElement>(null);
  const flourish = FLOURISH[tier];

  useLayoutEffect(() => {
    /**
     * Motion is the enhancement, not the default.
     *
     * Asking for `no-preference` and treating everything else — reduce, an
     * environment with no `matchMedia` at all — as "no animation" is what keeps
     * this dialog escapable. The alternative, branching inside
     * `gsap.matchMedia()`, silently does nothing when neither condition
     * matches, and `onOpened` is what reveals the buttons: a query that never
     * resolves would leave the user holding a modal with no way out.
     *
     * It also matches how the rest of the app treats motion — `motion-safe:`
     * in CSS is opt-in for exactly the same reason.
     */
    const animate =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    const context = gsap.context(() => {
      if (!animate) {
        gsap.set("[data-part='pack']", { autoAlpha: 0 });
        gsap.set("[data-part='card']", { autoAlpha: 1, y: 0, scale: 1 });
        onOpened();
        return;
      }

      const shake = SHAKE_MS[tier] / 1000;
      const timeline = gsap.timeline({ onComplete: onOpened });

      timeline
        // The pack rocks harder the rarer it is — a legendary is visibly
        // struggling to stay shut.
        .to("[data-part='pack']", {
          rotation: tier === "legendary" ? 6 : 3,
          duration: shake / 8,
          repeat: 7,
          yoyo: true,
          ease: "sine.inOut",
          transformOrigin: "50% 100%",
        })
        .to("[data-part='flap']", {
          rotationX: -160,
          duration: 0.32,
          ease: "back.in(1.4)",
          transformOrigin: "50% 0%",
        })
        .to(
          "[data-part='card']",
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" },
          "-=0.1",
        )
        .to("[data-part='pack']", { autoAlpha: 0, duration: 0.25 }, "-=0.35");

      if (flourish.bloom) {
        timeline.fromTo(
          "[data-part='bloom']",
          { autoAlpha: 0.9, scale: 0.4 },
          { autoAlpha: 0, scale: 1.6, duration: 0.5, ease: "power2.out" },
          "-=0.4",
        );
      }
      if (flourish.ring) {
        timeline.fromTo(
          "[data-part='ring']",
          { autoAlpha: 0.8, scale: 0.5 },
          { autoAlpha: 0, scale: 1.9, duration: 0.7, ease: "power2.out" },
          "-=0.5",
        );
      }

      // Stretch the finished sequence to the tier's target length. Scaling the
      // whole timeline keeps every beat in proportion — slowing the shake by
      // hand and leaving the flap alone would just make it feel broken.
      timeline.timeScale(timeline.duration() / (REVEAL_MS[tier] / 1000));
    }, root);

    return () => context.revert();
  }, [tier, flourish.bloom, flourish.ring, onOpened]);

  return (
    <div
      ref={root}
      // `overflow-hidden` because the flourishes grow past the card on purpose.
      // Without it they enlarge the dialog's scrollable area and it slides
      // sideways — light spreading beyond a frame should be clipped by the
      // frame, not turn the page into a canvas.
      className="relative flex w-full items-center justify-center overflow-hidden py-4"
    >
      {/* A fixed stage. The pack used to be `absolute` with no inset, which
          puts it at its *static* position — wherever flex would have laid it
          out — so it sat off the card and covered only part of it. Both layers
          now fill the same box, which is what makes the pack a lid. */}
      {/* The stage is deliberately LARGER than the card. The ring and the bloom
          sit behind the sticker, so with the card filling the stage they were
          drawn and then completely covered — the effect ran where nobody could
          see it. The gap around the card is the effect's stage. */}
      <div className="relative w-80 max-w-[80vw]" style={{ aspectRatio: "4 / 5" }}>
        {flourish.ring && (
          <span
            data-part="ring"
            aria-hidden
            // `inset-0 m-auto` centres it without a transform: GSAP animates
            // `scale`, and a `-translate-x-1/2` here would be overwritten the
            // moment the timeline touched it — which is how the ring ended up
            // in the top-left corner.
            className="pointer-events-none absolute inset-0 m-auto size-64 rounded-full border-2 opacity-0"
            style={{ borderColor: `var(--color-rarity-${tier}-ring)` }}
          />
        )}
        {flourish.bloom && (
          <span
            data-part="bloom"
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto size-56 rounded-full opacity-0 blur-xl"
            style={{ background: `var(--color-rarity-${tier})` }}
          />
        )}

        {/* Card and pack share this box, so the pack is exactly a lid. */}
        <div
          className="absolute inset-0 m-auto w-48 max-w-[52vw]"
          style={{ aspectRatio: "var(--aspect-card)" }}
        >
          {/* The card underneath, waiting. It is in the DOM from the start so the
          reveal is a reveal rather than a mount — a node that appears mid-
          timeline cannot be animated out of the pack it was supposedly inside. */}
          <div
            data-part="card"
            data-tier={tier}
            className={cx(
              "absolute inset-0 overflow-hidden rounded-xl opacity-0",
              flourish.shine && "motion-safe:animate-legend-glow",
            )}
            style={{
              background: `var(--gradient-frame-${tier})`,
              padding: `var(--frame-pad-${tier})`,
              transform: "translateY(24px) scale(0.85)",
            }}
          >
            <div className="h-full w-full overflow-hidden rounded-lg bg-surface-2">
              {imageKey && (
                <img src={imageSrc(imageKey)} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            {/* Which copy this is. One copy is not a duplicate, so the badge stays
            away until there is something to say. */}
            {quantity > 1 && (
              <span className="absolute top-1 left-1">
                <Badge tone="coin" variant="solid" size="sm" font="numeric">
                  ×{quantity}
                </Badge>
              </span>
            )}
          </div>

          {/* The pack, over the card until it opens. */}
          <div
            data-part="pack"
            aria-hidden
            className="absolute inset-0 rounded-xl border border-border-strong"
            style={{
              // NOT `--gradient-panel-raised`: that is the dialog's own surface,
              // so the pack's body disappeared into the background and only the
              // coloured flap read as an envelope — it looked like a lid covering
              // a third of the sticker.
              background: "var(--gradient-cover)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div
              data-part="flap"
              className="h-1/3 w-full rounded-t-xl border-border border-b"
              style={{ background: `var(--gradient-frame-${tier})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
