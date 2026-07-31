import { describe, expect, it } from "vitest";
import { claimsGesture, rowOffset, SWIPE_CLAIM_PX, SWIPE_COMMIT_PX, swipeIntent } from "./swipe";

describe("claiming the gesture", () => {
  it("leaves a small movement alone, so a tap stays a tap", () => {
    expect(claimsGesture(4, 0)).toBe(false);
    expect(claimsGesture(SWIPE_CLAIM_PX, 0)).toBe(false);
  });

  it("leaves a vertical drag to the scroller", () => {
    // No vertical drag on a phone is perfectly vertical. Claiming on horizontal
    // distance alone would make the list impossible to scroll.
    expect(claimsGesture(20, 60)).toBe(false);
  });

  it("takes a mostly-horizontal drag", () => {
    expect(claimsGesture(40, 10)).toBe(true);
    expect(claimsGesture(-40, 10)).toBe(true);
  });
});

describe("what a released gesture means", () => {
  it("is nothing until it has gone far enough", () => {
    expect(swipeIntent(SWIPE_COMMIT_PX - 1, 0)).toBeNull();
  });

  it("right is a pin, left is a delete", () => {
    expect(swipeIntent(SWIPE_COMMIT_PX, 0)).toBe("pin");
    expect(swipeIntent(-SWIPE_COMMIT_PX, 0)).toBe("delete");
    expect(swipeIntent(200, 0)).toBe("pin");
    expect(swipeIntent(-200, 0)).toBe("delete");
  });

  it("is nothing when the finger mostly went down the page", () => {
    // A long diagonal scroll must not delete a task on the way past.
    expect(swipeIntent(-100, 300)).toBeNull();
  });
});

describe("how far the row follows", () => {
  it("does not move until the gesture is claimed", () => {
    expect(rowOffset(5, 0)).toBe(0);
    expect(rowOffset(20, 80)).toBe(0);
  });

  it("tracks the finger up to the commit distance", () => {
    expect(rowOffset(40, 0)).toBe(40);
    expect(rowOffset(-40, 0)).toBe(-40);
  });

  it("resists past it, so the threshold can be felt", () => {
    const far = rowOffset(SWIPE_COMMIT_PX + 100, 0);

    expect(far).toBeGreaterThan(SWIPE_COMMIT_PX);
    expect(far).toBeLessThan(SWIPE_COMMIT_PX + 100);
  });

  it("resists symmetrically in both directions", () => {
    expect(rowOffset(-(SWIPE_COMMIT_PX + 100), 0)).toBe(-rowOffset(SWIPE_COMMIT_PX + 100, 0));
  });

  it("never runs away with the row", () => {
    // A flick across the whole screen should still leave the row on its list.
    expect(Math.abs(rowOffset(2000, 0))).toBeLessThan(600);
  });
});
