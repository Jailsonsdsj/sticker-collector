import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Celebration } from "./Celebration";

const key = `img/${"c".repeat(64)}.jpg`;

const renderIt = () => {
  const onClose = vi.fn();
  render(<Celebration title="Forest Friends" coverKey={key} onClose={onClose} />);
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
