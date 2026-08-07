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

export type SwipeIntent = "start" | "pin" | null;

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

/**
 * Which way a released gesture went: -1 left, 1 right, 0 not far enough.
 *
 * The direction and the meaning are separate on purpose. A row reads right as
 * "pin" and left as "delete"; the sticker viewer reads the same gesture as
 * previous and next. Both agree on when a swipe counts, because both ask this.
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (!claimsGesture(dx, dy)) return 0;
  if (Math.abs(dx) < SWIPE_COMMIT_PX) return 0;
  return dx > 0 ? 1 : -1;
}

/**
 * What a released gesture means to a task row, or null if it was not far
 * enough.
 *
 * Right **starts** the task, left pulls it into **today**. Left used to delete,
 * which is why the row no longer opens and holds a button: neither of these is
 * destructive, and both are undone by swiping the other way.
 */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const direction = swipeDirection(dx, dy);
  if (direction === 0) return null;
  return direction > 0 ? "start" : "pin";
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

/**
 * A card that follows the finger — the gesture the dating apps made standard.
 *
 * The sticker viewer used to sample only the start and end of a touch and let
 * the browser own everything in between, which meant the page scrolled under
 * the picture while the picture sat still. A card that *tracks* the finger has
 * to answer two questions on every frame, and both of them are arithmetic:
 * how far it has tilted, and how far it has faded.
 */

/** Degrees at the commit distance. Past that the tilt stops growing — a card
 *  spinning past ~15° stops reading as a card being moved. */
export const CARD_TILT_MAX_DEG = 12;

/** How much a card is allowed to fade before it is released. Never to zero:
 *  the thing being dragged has to stay the thing you are looking at. */
export const CARD_FADE_FLOOR = 0.55;

export function cardTilt(dx: number): number {
  const share = Math.max(-1, Math.min(1, dx / SWIPE_COMMIT_PX));
  return share * CARD_TILT_MAX_DEG;
}

export function cardFade(dx: number): number {
  const share = Math.min(Math.abs(dx) / (SWIPE_COMMIT_PX * 2), 1);
  return 1 - share * (1 - CARD_FADE_FLOOR);
}
