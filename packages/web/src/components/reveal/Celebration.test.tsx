import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Celebration } from "./Celebration";

const key = `img/${"c".repeat(64)}.jpg`;

const renderIt = (over: Partial<Parameters<typeof Celebration>[0]> = {}) => {
  const onClose = vi.fn();
  render(
    <Celebration
      title="Forest Friends"
      coverKey={key}
      message="Every slot in Forest Friends is filled. The print sheet is ready."
      action="See the album"
      onClose={onClose}
      {...over}
    />,
  );
  return { onClose };
};

describe("finishing an album", () => {
  it("says which album, to a screen reader as well", () => {
    renderIt();
    expect(screen.getByRole("dialog", { name: "Forest Friends is complete" })).toBeInTheDocument();
  });

  it("shows the album's own cover", () => {
    renderIt();
    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute(
      "src",
      `/api/images/${key}`,
    );
  });

  it("points at what was unlocked by finishing", () => {
    // Completion is what opens the print export; the celebration should say so
    // rather than just congratulate.
    renderIt();
    expect(screen.getByText(/print sheet is ready/i)).toBeInTheDocument();
  });

  it("has a way out", () => {
    renderIt();
    expect(screen.getByRole("button", { name: "See the album" })).toBeInTheDocument();
  });

  it("closes when taken", async () => {
    const user = userEvent.setup();
    const { onClose } = renderIt();

    await user.click(screen.getByRole("button", { name: "See the album" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("is not a <dialog>, so it cannot fight the reveal for the top layer", () => {
    // The reveal dialog can still be open when the last sticker lands. Two
    // native dialogs in the top layer argue over focus and Escape.
    renderIt();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("throws a shower, not a single falling object", () => {
    renderIt();
    expect(document.querySelectorAll("[data-part='confetto']").length).toBeGreaterThan(10);
  });
});

describe("shared with puzzles", () => {
  // A puzzle finishes the same way and deserves the same noise. What differs
  // is a sentence, a button and the picture's shape — so those are passed in
  // rather than branched on inside.
  it("carries whatever was finished, in its own words", () => {
    renderIt({
      title: "The harbour",
      message: "Every piece of The harbour is in place.",
      action: "See the picture",
    });

    expect(screen.getByRole("dialog", { name: "The harbour is complete" })).toBeInTheDocument();
    expect(screen.getByText("Every piece of The harbour is in place.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See the picture" })).toBeInTheDocument();
  });

  it("takes the picture's own shape, so a finished puzzle is not cropped", () => {
    // An album cover is always a card; a puzzle is whatever was imported.
    // Cutting the edges off the thing just assembled, at the moment it is
    // assembled, is the one place that is least forgivable.
    renderIt({ aspect: "3 / 2" });

    // The raw attribute, not `style.aspectRatio`: jsdom's CSS parser does not
    // know the property and drops it, so the object reads empty either way.
    const frame = document.querySelector("[data-part='cover']") as HTMLElement;
    expect(frame.getAttribute("style")).toContain("aspect-ratio: 3 / 2");
  });

  it("falls back to a card when no shape is given", () => {
    renderIt();

    const frame = document.querySelector("[data-part='cover']") as HTMLElement;
    expect(frame.getAttribute("style")).toContain("aspect-ratio: var(--aspect-card)");
  });
});

describe("the headline is a word, not a coloured bar", () => {
  it("paints the gradient with `background-image`, never the shorthand", () => {
    /**
     * The `background` shorthand resets `background-clip` to `border-box`, so
     * the text clip is discarded and the gradient fills the whole box — and
     * since the text is transparent, "Complete" becomes an unreadable rainbow
     * rectangle. It shipped that way on the album celebration.
     *
     * Asserted on the class because jsdom applies no stylesheet at all: there
     * is no computed style here to catch it, and a browser is where it was
     * actually found. This pins the one decision that matters.
     */
    renderIt();
    const headline = screen.getByText("Complete");

    expect(headline.className).toContain("[background-image:var(--gradient-holo-text)]");
    expect(headline.className).not.toContain("[background:var(");
  });
});
