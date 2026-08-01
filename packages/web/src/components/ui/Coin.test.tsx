import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Coin } from "./Coin";

/**
 * jsdom has no compositor, so none of this proves the coin *looks* right —
 * that is a browser's job. What it can hold is the assembly: two faces, the
 * star forward, a size that matches its neighbour, and motion that stays
 * opt-in.
 */
const faces = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));

describe("assembling the coin", () => {
  it("has a front and a reverse, and nothing else", () => {
    const { container } = render(<Coin />);

    expect(faces(container)).toEqual(["/coin/front.png", "/coin/back.png"]);
    // No rim, by request. The design's third image stays unused, so the coin is
    // a zero-thickness object rather than a cylinder.
    expect(container.querySelector(".coin-edge")).toBeNull();
  });

  it("shows the star, not the writing", () => {
    // "Consider the star side": the reverse is only ever seen mid-turn.
    const { container } = render(<Coin />);

    const front = container.querySelector("img");
    expect(front).toHaveAttribute("src", "/coin/front.png");
    expect(front).not.toHaveClass("coin-face-back");
  });

  it("scales with the number it sits beside", () => {
    const { container: small } = render(<Coin size="xs" />);
    const { container: large } = render(<Coin size="lg" />);

    // A 16px coin next to a 48px figure reads as a bullet point.
    expect(small.firstChild).toHaveClass("size-4");
    expect(large.firstChild).toHaveClass("size-12");
  });

  it("only turns when asked", () => {
    const { container: still } = render(<Coin />);
    const { container: turning } = render(<Coin spin />);

    // Every price on the screen spinning at once would be a slot machine.
    expect(still.querySelector(".coin-body")).not.toHaveClass("animate-coin-spin");
    expect(turning.querySelector(".coin-body")).toHaveClass("animate-coin-spin");
  });

  it("stays out of the accessibility tree", () => {
    // The number beside it carries the meaning; "400 image" does not.
    const { container } = render(<Coin />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    for (const img of container.querySelectorAll("img")) expect(img).toHaveAttribute("alt", "");
  });
});
