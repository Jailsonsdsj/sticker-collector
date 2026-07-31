import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageTile } from "./ImageTile";

const shimmer = (container: HTMLElement) => container.querySelector(".animate-image-shimmer");

describe("an image on its way", () => {
  it("shimmers until it has decoded", () => {
    const { container } = render(<ImageTile src="/img/a.jpg" />);
    expect(shimmer(container)).not.toBeNull();
  });

  it("stops the moment the image loads", () => {
    // Driven by the image's own load event, not a timer, so it cannot claim to
    // still be loading after the picture has arrived — or stop before it has.
    const { container } = render(<ImageTile src="/img/a.jpg" alt="Fox" />);

    fireEvent.load(screen.getByAltText("Fox"));

    expect(shimmer(container)).toBeNull();
  });

  it("stops on failure too", () => {
    // A shimmer that runs forever over an image which is never coming promises
    // something the app cannot deliver.
    const { container } = render(<ImageTile src="/img/missing.jpg" alt="Fox" />);

    fireEvent.error(screen.getByAltText("Fox"));

    expect(shimmer(container)).toBeNull();
  });

  it("keeps the image in the tree the whole time, so there is no reflow", () => {
    // The placeholder sits behind the image rather than instead of it: the tile
    // is already the right size when the picture arrives.
    render(<ImageTile src="/img/a.jpg" alt="Fox" />);
    expect(screen.getByAltText("Fox")).toBeInTheDocument();
  });

  it("hides the placeholder from assistive tech", () => {
    const { container } = render(<ImageTile src="/img/a.jpg" />);
    expect(shimmer(container)).toHaveAttribute("aria-hidden");
  });

  it("carries the caller's filter through to the image", () => {
    // StickerSlot's grayscale is a style on the <img>; losing it would unlock
    // every locked slot visually.
    render(<ImageTile src="/img/a.jpg" alt="Fox" style={{ filter: "var(--filter-locked)" }} />);

    expect(screen.getByAltText("Fox").getAttribute("style")).toContain("--filter-locked");
  });

  it("is decorative by default", () => {
    render(<ImageTile src="/img/a.jpg" />);
    expect(screen.getByRole("presentation", { hidden: true })).toBeInTheDocument();
  });
});
