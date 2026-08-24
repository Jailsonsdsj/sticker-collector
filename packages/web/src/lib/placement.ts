import type { Tier } from "@sticker-collector/shared";
import gsap from "gsap";
import { FLOURISH } from "./rarity";

/**
 * Putting a freshly pulled sticker into the album, where the user can see it
 * land.
 *
 * The reveal ends with a tap, and what follows has to answer "where did that
 * go?" — otherwise a pull is a dialog that closes and a grid that silently
 * changed somewhere off screen. So the grid scrolls to the slot and the slot
 * plays a short settle.
 *
 * Kept out of the component because the interesting part is DOM plumbing:
 * finding the slot, scrolling to it, and animating it — none of which needs to
 * know about React, and all of which is easier to reason about here.
 */

/** Marks a slot so the placement can find it again after the grid re-renders. */
export const SLOT_ATTRIBUTE = "data-sticker-id";

/**
 * Motion is the enhancement, everywhere.
 *
 * Same rule as the envelope: anything other than an explicit `no-preference` —
 * a reduce preference, or an environment with no `matchMedia` at all — gets the
 * result without the movement. A scroll that never happens is a worse failure
 * than one that happens instantly.
 */
export function prefersMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  );
}

export function findSlot(stickerId: string, root: ParentNode = document): HTMLElement | null {
  // Attribute selector rather than an id: ids have to be unique across the
  // whole document, and the same sticker can legitimately appear twice on
  // screen while a grid is mid-transition.
  return root.querySelector<HTMLElement>(`[${SLOT_ATTRIBUTE}="${stickerId}"]`);
}

/**
 * Scrolls the slot into view and settles the sticker into it.
 *
 * Returns the element it acted on, or null when the slot is not on screen —
 * a filter can legitimately be hiding it, and that is the caller's business to
 * fix, not something to throw about.
 */
export function placeSticker(stickerId: string, root: ParentNode = document): HTMLElement | null {
  const slot = findSlot(stickerId, root);
  if (!slot) return null;

  const motion = prefersMotion();

  // `block: "center"` rather than "nearest": the sticker that just arrived
  // should be the thing you are looking at, not the thing that scrolled just
  // far enough to be technically visible.
  slot.scrollIntoView?.({ behavior: motion ? "smooth" : "auto", block: "center" });

  if (motion) {
    gsap.fromTo(
      slot,
      { scale: 1.18 },
      { scale: 1, duration: 0.45, ease: "back.out(2)", clearProps: "transform" },
    );
  }

  return slot;
}

/**
 * The moment a thing on the shelf stops being locked.
 *
 * Unlocking costs real coins and is the gate on everything behind it, so it
 * earns more than a filter quietly lifting. A burst behind the cover plus a
 * short pop, on the card the user just paid for — found the same way a placed
 * sticker is, by an attribute rather than an id.
 */
export const ALBUM_ATTRIBUTE = "data-album-id";

/** The other kind of card in the same grid, celebrated the same way. */
export const PUZZLE_ATTRIBUTE = "data-puzzle-id";

/**
 * How long a direct purchase celebrates.
 *
 * Flat across tiers, unlike the pack: which flourishes fire still depends on
 * rarity, but a purchase you chose does not need a longer beat for being rare —
 * there was no suspense to draw out.
 */
export const BUY_MS = 2000;

export function playUnlock(id: string, root: ParentNode = document): HTMLElement | null {
  // Either kind of card. The shelf mixes albums and puzzles in one grid, and a
  // burst that fired for one but not the other would read as the puzzle's
  // purchase not having landed. Ids are UUIDs, so the two never collide.
  const card = root.querySelector<HTMLElement>(
    `[${ALBUM_ATTRIBUTE}="${id}"],[${PUZZLE_ATTRIBUTE}="${id}"]`,
  );
  if (!card || !prefersMotion()) return card;

  const context = gsap.context(() => {
    gsap
      .timeline()
      .fromTo(card, { scale: 0.96 }, { scale: 1.04, duration: 0.22, ease: "power2.out" })
      .to(card, { scale: 1, duration: 0.45, ease: "elastic.out(1, 0.45)" });

    // A ring leaving the cover, rather than a glow sitting on it: the album is
    // opening outwards.
    const ring = card.querySelector("[data-part='unlock-ring']");
    if (ring) {
      gsap.fromTo(
        ring,
        { autoAlpha: 0.9, scale: 0.6 },
        { autoAlpha: 0, scale: 1.8, duration: 0.8, ease: "power2.out" },
      );
    }
  });

  // Reverted on the next frame after the timelines finish; leaving the context
  // alive would keep every unlocked card's animation in memory for the session.
  window.setTimeout(() => context.revert(), 1200);
  return card;
}

/**
 * Buying a sticker outright.
 *
 * A direct purchase is not a surprise — you chose that one — so there is no
 * pack to open. The slot itself celebrates, in place, with the grid still on
 * screen: the art floods into colour (the CSS filter lifting, as it always did)
 * and the tier's own flourishes fire around it.
 *
 * Same rarity table as the pack (`FLOURISH`), because "what does a legendary
 * get that a common does not" has to be one answer, not two.
 */
export function celebrateSticker(
  stickerId: string,
  tier: Tier,
  root: ParentNode = document,
): HTMLElement | null {
  const slot = findSlot(stickerId, root);
  if (!slot || !prefersMotion()) return slot;

  const flourish = FLOURISH[tier];

  const context = gsap.context(() => {
    // Everything on ONE timeline so it can be stretched as a whole. The pop
    // used to be a timeline and the flourishes loose tweens beside it, which
    // meant there was nothing to scale — and the whole thing was over in about
    // three quarters of a second.
    const timeline = gsap.timeline();

    timeline
      .fromTo(slot, { scale: 0.94 }, { scale: 1.06, duration: 0.2, ease: "power2.out" })
      .to(slot, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });

    if (flourish.bloom) {
      timeline.fromTo(
        slot.querySelector("[data-part='buy-bloom']"),
        { autoAlpha: 0.85, scale: 0.5 },
        { autoAlpha: 0, scale: 1.5, duration: 0.55, ease: "power2.out" },
        0,
      );
    }
    if (flourish.ring) {
      timeline.fromTo(
        slot.querySelector("[data-part='buy-ring']"),
        { autoAlpha: 0.9, scale: 0.55 },
        { autoAlpha: 0, scale: 1.7, duration: 0.75, ease: "power2.out" },
        0,
      );
    }

    timeline.timeScale(timeline.duration() / (BUY_MS / 1000));
  }, slot);

  // Reverted once the timeline is done; an unreverted context per purchase
  // would keep every bought sticker's animation alive for the session.
  window.setTimeout(() => context.revert(), BUY_MS + 300);
  return slot;
}

/** Which piece a board tile is, for the landing animation to find it. */
export const PIECE_ATTRIBUTE = "data-piece-index";

/**
 * How long a random piece takes to land, glow and settle.
 *
 * Three seconds is the ceiling the whole sequence answers to, and it is a
 * ceiling rather than a target: the piece is *in place* well before the glow
 * has finished fading, so the board is usable while the light is still going
 * out. An animation that holds the screen hostage for its full length is one
 * people learn to sit through rather than enjoy.
 */
export const LAND_MS = 3000;

/** The snap, and the glow. Kept apart so the piece is readable before the
 *  light around it has gone. */
const SNAP_MS = 0.55;
const GLOW_MS = 1.6;

/**
 * The colours a landing can glow in.
 *
 * **Tokens, never a generated colour.** Computing one would be a line shorter
 * and would fail CI — colours come from `styles/tokens.css` only (CLAUDE.md) —
 * and it would put light on screen in a hue the palette does not contain. These
 * five are the app's own accents, the same set every button tone is drawn from,
 * so a landing is a surprise within the design rather than an escape from it.
 */
export const GLOW_TONES = ["coin", "lime", "cyan", "magenta", "violet"] as const;

export type GlowTone = (typeof GLOW_TONES)[number];

/** The last one used, so the next one is never the same. */
let lastTone: GlowTone | null = null;

/**
 * A colour for the next landing, never the one before it.
 *
 * Five colours means a naive draw repeats one pull in five, and two identical
 * flourishes in a row read as the effect having failed to change rather than as
 * chance. Excluding the last one costs a line and removes the only case anyone
 * would notice.
 *
 * `Math.random` rather than the crypto entropy the pull itself uses: this
 * decides a colour, not who gets paid.
 */
export function pickGlowTone(): GlowTone {
  const choices = GLOW_TONES.filter((tone) => tone !== lastTone);
  const tone = choices[Math.floor(Math.random() * choices.length)] as GlowTone;
  lastTone = tone;
  return tone;
}

/**
 * How large the piece starts — near enough to read as being held up to the
 * screen, not so large that a corner tile is mostly clipped by the board.
 */
const NEAR_SCALE = 2.4;

/**
 * A random piece arriving in its slot.
 *
 * Two things at once, deliberately. The tile **comes in from close to the
 * screen** — large, and shrinking to exactly its own size in its own slot,
 * which is what makes it read as a piece being pressed into place rather than
 * a colour fading up. And light spreads **from beneath it on all four sides**,
 * a shadow cast outwards rather than a border drawn on: a piece pushed into a
 * gap lights the gap, and the gap is on every side of it.
 *
 * **No travel and no rotation.** It grows from the middle of its own slot, so
 * it is over the right hole for the whole animation — a piece that flies in
 * from somewhere else has to be followed, and one that arrives crooked reads as
 * misaligned on a picture whose whole point is that the pieces line up.
 *
 * The glow is a `box-shadow`, not an extra element. A ring would have to be
 * positioned against a tile whose size depends on the grid, the zoom and the
 * picture's shape; a shadow is defined relative to the box it belongs to and is
 * right at every one of them.
 *
 * Returns the tile it acted on, or null when the board is not showing it — a
 * puzzle can legitimately be off screen by the time the request lands.
 */
export function playPieceLanding(index: number, root: ParentNode = document): HTMLElement | null {
  const tile = root.querySelector<HTMLElement>(`[${PIECE_ATTRIBUTE}="${index}"]`);
  if (!tile || !prefersMotion()) return tile;

  const glow = `var(--color-${pickGlowTone()})`;

  const context = gsap.context(() => {
    // Lifted above its neighbours for the duration. A tile at 2.4x that is
    // still in grid order is half-hidden behind the pieces around it, which
    // reads as growing *underneath* the board rather than in front of it.
    gsap.set(tile, { zIndex: 30, position: "relative" });

    gsap.fromTo(
      tile,
      { scale: NEAR_SCALE, autoAlpha: 0.2 },
      {
        scale: 1,
        autoAlpha: 1,
        duration: SNAP_MS,
        // `power4.out`, and NOT a `back` ease. `back` overshoots past its
        // target — which on a value that is *shrinking* means going below it:
        // measured at 0.80, the piece visibly became smaller than its own hole
        // and grew back, which reads as a squash rather than a snap. This
        // covers most of the distance immediately and decelerates hard into
        // place, never passing it.
        ease: "power4.out",
      },
    );

    // From beneath, on all four sides: a spread with no offset, growing out of
    // nothing and fading back to it.
    gsap.fromTo(
      tile,
      { boxShadow: `0 0 0 0 ${glow}` },
      {
        boxShadow: `0 0 28px 10px color-mix(in srgb, ${glow} 0%, transparent)`,
        keyframes: {
          boxShadow: [
            `0 0 0 0 color-mix(in srgb, ${glow} 85%, transparent)`,
            `0 0 30px 12px color-mix(in srgb, ${glow} 55%, transparent)`,
            `0 0 40px 16px color-mix(in srgb, ${glow} 0%, transparent)`,
          ],
          easeEach: "power2.out",
        },
        duration: GLOW_MS,
      },
    );
  });

  // Reverted once the sequence is over, and never later: an unreverted context
  // per pull would keep every landing of the session alive in memory.
  window.setTimeout(() => context.revert(), LAND_MS);
  return tile;
}
