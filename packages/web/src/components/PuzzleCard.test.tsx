import type { Puzzle } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { PuzzleCard } from "./PuzzleCard";

const puzzle = (over: Partial<Puzzle> = {}): Puzzle => ({
  id: "p1",
  title: "The harbour",
  description: null,
  imageKey: `img/${"b".repeat(64)}.jpg`,
  imageWidth: 1536,
  imageHeight: 1024,
  unlockPrice: 100,
  piecePrice: 25,
  rows: 2,
  cols: 3,
  hideLocked: false,
  unlockedAt: null,
  completedAt: null,
  sealedAt: "2026-07-02T00:00:00Z",
  createdAt: "2026-07-02T00:00:00Z",
  ownedCount: 0,
  ...over,
});

const view = (over: Partial<Puzzle> = {}) => {
  const { container } = render(
    <MemoryRouter>
      <PuzzleCard puzzle={puzzle(over)} />
    </MemoryRouter>,
  );
  return container.querySelector("img") as HTMLImageElement;
};

describe("the cover", () => {
  it("stays grey while the picture is unfinished, even once it is open", () => {
    // NOT the album rule. An album is a container you open and then fill; a
    // puzzle is one picture that is either whole or is not, so colour has to
    // mean finished rather than merely paid for.
    const open = view({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 });
    expect(open.style.filter).toBe("var(--filter-locked)");
  });

  it("comes into colour when the last piece lands", () => {
    const done = view({
      unlockedAt: "2026-08-01T00:00:00Z",
      completedAt: "2026-08-02T00:00:00Z",
      ownedCount: 6,
    });
    expect(done.style.filter).toBe("var(--filter-unlocked)");
  });

  it("is one image and one filter, never a second grey asset", () => {
    const grey = view();
    const colour = view({ completedAt: "2026-08-02T00:00:00Z" });
    expect(grey.src).toBe(colour.src);
  });
});

describe("what the card says", () => {
  it("says it is a puzzle, because the shelf now holds two kinds of thing", () => {
    render(
      <MemoryRouter>
        <PuzzleCard puzzle={puzzle()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Puzzle")).toBeInTheDocument();
  });

  it("shows the price while it is still shut, and no progress bar", () => {
    render(
      <MemoryRouter>
        <PuzzleCard puzzle={puzzle()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Locked · 100/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows progress once it is open", () => {
    render(
      <MemoryRouter>
        <PuzzleCard puzzle={puzzle({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("names the pieces owned in the link, for anyone not looking at the bar", () => {
    render(
      <MemoryRouter>
        <PuzzleCard puzzle={puzzle({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 })} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "The harbour, puzzle, 3 of 6 pieces" }),
    ).toBeInTheDocument();
  });

  it("leads to the board", () => {
    render(
      <MemoryRouter>
        <PuzzleCard puzzle={puzzle()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/puzzles/p1");
  });
});
