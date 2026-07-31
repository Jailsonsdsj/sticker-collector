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
 * The moment an album stops being locked.
 *
 * Unlocking costs real coins and is the gate on everything else in an album, so
 * it earns more than a filter quietly lifting. A burst behind the cover plus a
 * short pop, on the card the user just paid for — found the same way a placed
 * sticker is, by an attribute rather than an id.
 */
export const ALBUM_ATTRIBUTE = "data-album-id";

/**
 * How long a direct purchase celebrates.
 *
 * Flat across tiers, unlike the pack: which flourishes fire still depends on
 * rarity, but a purchase you chose does not need a longer beat for being rare —
 * there was no suspense to draw out.
 */
export const BUY_MS = 2000;

export function playUnlock(albumId: string, root: ParentNode = document): HTMLElement | null {
  const card = root.querySelector<HTMLElement>(`[${ALBUM_ATTRIBUTE}="${albumId}"]`);
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
