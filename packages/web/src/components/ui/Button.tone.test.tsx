import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

/**
 * A tone's colour as a surface and its colour as text are not the same thing.
 *
 * `neutral`'s accent is `--color-surface-2` — 6% white — which is right behind
 * a solid button and invisible as type. `ghost` and `outline` render the tone
 * as text, so every Cancel in the app, and Edit on an epic card, were being
 * drawn at 6% opacity on a dark panel.
 */
const inkOf = (el: HTMLElement) => el.style.getPropertyValue("--ui-ink");

describe("neutral", () => {
  it("draws its text in ink, not in a surface colour", () => {
    render(
      <Button variant="ghost" tone="neutral">
        Cancel
      </Button>,
    );
    expect(inkOf(screen.getByRole("button"))).toBe("var(--color-ink-secondary)");
  });

  it("does the same for outline — Edit had the identical bug", () => {
    render(
      <Button variant="outline" tone="neutral">
        Edit
      </Button>,
    );
    expect(inkOf(screen.getByRole("button"))).toBe("var(--color-ink-secondary)");
  });

  it("keeps the surface colour for the solid fill", () => {
    // The concept is unchanged: Cancel is still quiet and unfilled. Only its
    // legibility changed.
    render(<Button tone="neutral">Cancel</Button>);
    expect(screen.getByRole("button").style.getPropertyValue("--ui-accent")).toBe(
      "var(--color-surface-2)",
    );
  });
});

describe("every other tone", () => {
  it("is unaffected — ink falls back to the accent", () => {
    for (const tone of ["coin", "lime", "magenta", "violet", "cyan"] as const) {
      const { unmount } = render(
        <Button variant="ghost" tone={tone}>
          Go
        </Button>,
      );
      const button = screen.getByRole("button");
      expect(inkOf(button), tone).toBe(button.style.getPropertyValue("--ui-accent"));
      unmount();
    }
  });

  it("never resolves ink to a surface token", () => {
    for (const tone of ["coin", "lime", "magenta", "violet", "cyan", "neutral"] as const) {
      const { unmount } = render(<Button tone={tone}>Go</Button>);
      expect(inkOf(screen.getByRole("button")), tone).not.toContain("surface");
      unmount();
    }
  });
});
