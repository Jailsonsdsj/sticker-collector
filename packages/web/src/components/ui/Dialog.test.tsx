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
