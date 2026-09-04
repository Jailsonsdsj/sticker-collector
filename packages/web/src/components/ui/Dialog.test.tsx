import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

const panel = () => document.querySelector("dialog") as HTMLElement;

const open = (props: Partial<Parameters<typeof Dialog>[0]> = {}) =>
  render(
    <Dialog open onClose={vi.fn()} title="Delete epic?" {...props}>
      <p>Are you sure?</p>
    </Dialog>,
  );

describe("how much room a dialog gets", () => {
  it("is a confirmation by default — a sentence and two buttons", () => {
    // Widening this by default would make every one-line question look like a
    // form.
    open();

    expect(panel().className).toContain("28rem");
    expect(panel().className).not.toContain("36rem");
  });

  it("goes wider only when asked", () => {
    // For the one dialog that carries a list.
    open({ size: "lg" });

    expect(panel().className).toContain("36rem");
    expect(panel().className).not.toContain("28rem");
  });

  it("never outgrows the viewport at either size", () => {
    // A modal wider than the screen puts its own buttons off the edge.
    for (const size of ["md", "lg"] as const) {
      const { unmount } = open({ size });
      expect(panel().className).toContain("calc(100vw-2.75rem)");
      unmount();
    }
  });
});

describe("how wide a dialog gets", () => {
  const panel = () => document.querySelector("dialog") as HTMLElement;

  it("still takes the width of what is in it", () => {
    // Unchanged, and the reason a one-line confirmation is not a billboard.
    render(
      <Dialog open title="Short">
        <p>Brief.</p>
      </Dialog>,
    );

    expect(panel().className).toContain("max-w-");
  });

  it("has a floor under it, so a short one is not a column", () => {
    // A short title over a short sentence collapsed to barely wider than its
    // own buttons, which reads as a rendering fault rather than a small dialog.
    render(
      <Dialog open title="Short">
        <p>Brief.</p>
      </Dialog>,
    );

    expect(panel().className).toContain("min-w-");
  });

  it("clamps the floor to the viewport, so it cannot push off a phone", () => {
    // The same `100vw - 2.75rem` the maxima use. Without it the minimum wins
    // on a narrow screen and the dialog hangs off the side.
    render(
      <Dialog open title="Short">
        <p>Brief.</p>
      </Dialog>,
    );

    const min = panel()
      .className.split(" ")
      .find((c) => c.startsWith("min-w-"));
    expect(min).toContain("100vw");
  });

  it("keeps the floor under a large dialog too", () => {
    render(
      <Dialog open size="lg" title="Long">
        <p>Brief.</p>
      </Dialog>,
    );

    expect(panel().className).toContain("min-w-");
    expect(panel().className).toContain("36rem");
  });
});
