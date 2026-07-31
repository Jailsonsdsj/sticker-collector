/**
 * The rules of a row swipe, as arithmetic.
 *
 * Kept separate from the component because the interesting parts of a gesture
 * are decisions — is this a swipe or a scroll, has it gone far enough, which
 * way — and those are far easier to get right, and to prove, without a
 * simulated finger involved.
 */

/** How far a finger must travel before the gesture commits. */
export const SWIPE_COMMIT_PX = 72;

/**
 * How far it must travel before the row claims the gesture at all.
 *
 * Below this the row stays still and the page keeps scrolling. A row that
 * starts sliding on the first pixel makes a list impossible to scroll on a
 * phone, because no vertical drag begins perfectly vertical.
 */
export const SWIPE_CLAIM_PX = 12;

/**
 * Where the row rests once a left swipe has opened it.
 *
 * The row stays here, holding the Delete button out from under itself, until
 * the button is pressed or the row is dismissed. Wide enough for a 44px target
 * plus breathing room on either side.
 */
export const SWIPE_REVEAL_PX = 104;

export type SwipeIntent = "pin" | "delete" | null;

/**
 * Is this gesture the row's, or the scroller's?
 *
 * Horizontal travel has to both exceed the claim distance *and* beat the
 * vertical travel. Checking only the first would steal a diagonal flick from a
 * list that is trying to scroll.
 */
export function claimsGesture(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_CLAIM_PX && Math.abs(dx) > Math.abs(dy);
}

/** What a released gesture means, or null if it was not far enough. */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  if (!claimsGesture(dx, dy)) return null;
  if (Math.abs(dx) < SWIPE_COMMIT_PX) return null;
  return dx > 0 ? "pin" : "delete";
}

/**
 * How far the row actually moves, given how far the finger did.
 *
 * Travel past the commit distance is damped rather than followed, so the row
 * still reports "yes, I felt that" without sliding off its own list. The point
 * of resistance is also the feedback that the threshold has been passed.
 */
export function rowOffset(dx: number, dy: number): number {
  if (!claimsGesture(dx, dy)) return 0;

  const past = Math.abs(dx) - SWIPE_COMMIT_PX;
  const travelled = past <= 0 ? Math.abs(dx) : SWIPE_COMMIT_PX + past * 0.25;
  return Math.sign(dx) * travelled;
}
