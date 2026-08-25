import type { AlbumSummary, Puzzle } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PUZZLE_ATTRIBUTE } from "../lib/placement";
import { AlbumCard } from "./AlbumCard";
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
  randomPrice: 40,
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

const card = (
  over: Partial<Puzzle> = {},
  props: { affordable?: boolean; onUnlock?: () => void } = {},
) =>
  render(
    <MemoryRouter>
      <PuzzleCard
        puzzle={puzzle(over)}
        affordable={props.affordable ?? true}
        onUnlock={props.onUnlock ?? vi.fn()}
      />
    </MemoryRouter>,
  );

const view = (over: Partial<Puzzle> = {}) =>
  card(over).container.querySelector("img") as HTMLImageElement;

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

  it("fills the tile, the way an album's cover does", () => {
    // A letterboxed thumbnail in a grid of filled ones reads as broken. The
    // whole picture is still what got stored — the board is where you see it.
    expect(view().className).toContain("object-cover");
    expect(view().className).not.toContain("object-contain");
  });

  it("is one image and one filter, never a second grey asset", () => {
    const grey = view();
    const colour = view({ completedAt: "2026-08-02T00:00:00Z" });
    expect(grey.src).toBe(colour.src);
  });
});

describe("what the card says", () => {
  it("says it is a puzzle, because the shelf now holds two kinds of thing", () => {
    card();
    expect(screen.getByText("Puzzle")).toBeInTheDocument();
  });

  it("shows progress once it is open", () => {
    card({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("writes the figure inside the bar, the way an album's does", () => {
    // A thin unlabelled sliver beside a full labelled bar, in one grid, reads
    // as two different kinds of progress rather than the same thing twice.
    card({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 });

    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });

  it("shows the whole title rather than cutting it off", () => {
    // A cut title tells you a name exists and refuses to say what it is, on a
    // card whose job is to be recognised.
    const long = "A very long puzzle title that will not fit on one line at all";
    card({ title: long });

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toBe(long);
    expect(heading.className).not.toContain("truncate");
  });

  it("names the pieces owned in the link, for anyone not looking at the bar", () => {
    card({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 });

    expect(
      screen.getByRole("link", { name: "The harbour, puzzle, 3 of 6 pieces" }),
    ).toBeInTheDocument();
  });

  it("leads to the board", () => {
    card();

    expect(screen.getByRole("link")).toHaveAttribute("href", "/puzzles/p1");
  });
});

describe("opening it from the shelf", () => {
  it("offers the same unlock control an album card offers", async () => {
    // It used to say `Locked · 100` and send you to the board to buy it. Two
    // cards side by side in one grid, where one can be bought where it sits and
    // the other cannot, is a difference the user has to learn for no reason.
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    card({}, { onUnlock });

    await user.click(screen.getByRole("button", { name: "Unlock 100" }));

    expect(onUnlock).toHaveBeenCalledOnce();
  });

  it("marks one the balance could open right now", () => {
    // The affordability cue, same as an album's: "what can I afford" should
    // need no arithmetic. It is the gold *fill* that carries it — the shadow is
    // the flourish on top, and asserting only the shadow left the button free
    // to go grey while still passing.
    card({}, { affordable: true });
    const button = screen.getByRole("button", { name: "Unlock 100" });

    expect(button.style.getPropertyValue("--ui-accent")).toBe("var(--color-coin)");
    expect(button.className).toContain("shadow-coin");
  });

  it("leaves one it could not open quiet", () => {
    card({}, { affordable: false });
    const button = screen.getByRole("button", { name: "Unlock 100" });

    expect(button.style.getPropertyValue("--ui-accent")).not.toBe("var(--color-coin)");
    expect(button.className).not.toContain("shadow-coin");
  });

  it("still offers it when the coins are short, rather than hiding the price", () => {
    // Disabling it would hide what the puzzle costs behind a dead control, and
    // the price is the reason to go and earn some.
    card({}, { affordable: false });
    expect(screen.getByRole("button", { name: "Unlock 100" })).toBeEnabled();
  });

  it("drops the button once it is open, leaving the bar in its place", () => {
    card({ unlockedAt: "2026-08-01T00:00:00Z", ownedCount: 3 });

    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("carries what the unlock burst looks for", () => {
    // `playUnlock` finds the card by its attribute and the ring inside it.
    // Without either, the puzzle's purchase lands in silence while an album's
    // beside it celebrates — and nothing else in the app would notice.
    const { container } = card();
    const tile = container.querySelector(`[${PUZZLE_ATTRIBUTE}="p1"]`);
    expect(tile).not.toBeNull();
    expect(tile?.querySelector("[data-part='unlock-ring']")).not.toBeNull();
  });
});

describe("the same control, not a lookalike", () => {
  /**
   * The request was for *the album's* unlock button, and the way that decays is
   * quietly: someone restyles the album's and the puzzle's stays as it was, and
   * two buttons that are meant to be one thing drift apart a shade at a time.
   * So this renders both and compares them, rather than pinning the classes a
   * gold button happens to have today.
   */
  const albumButton = (over: Partial<AlbumSummary> = {}) => {
    const album = {
      id: "a1",
      title: "Kitchen heroes",
      coverKey: `img/${"a".repeat(64)}.jpg`,
      status: "locked",
      percent: 0,
      owned: 0,
      total: 12,
      remaining: 12,
      almostThere: false,
      unlockPrice: 100,
      affordable: true,
      ...over,
    } as AlbumSummary;
    const { unmount } = render(
      <MemoryRouter>
        <AlbumCard album={album} onUnlock={vi.fn()} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "Unlock 100" });
    const shape = { className: button.className, accent: button.getAttribute("style") };
    unmount();
    return shape;
  };

  const puzzleButton = (affordable: boolean) => {
    const { unmount } = card({}, { affordable });
    const button = screen.getByRole("button", { name: "Unlock 100" });
    const shape = { className: button.className, accent: button.getAttribute("style") };
    unmount();
    return shape;
  };

  it("looks exactly like an album's when the coins are there", () => {
    expect(puzzleButton(true)).toEqual(albumButton({ affordable: true }));
  });

  it("looks exactly like an album's when they are not", () => {
    expect(puzzleButton(false)).toEqual(albumButton({ affordable: false }));
  });
});

describe("the progress bar is the album's, not a lookalike", () => {
  /**
   * Same reasoning as the unlock button below: the request was for *the
   * album's* bar, and the way that decays is quietly — someone changes one and
   * the other keeps a size or a tone nobody notices. So this renders both at
   * the same progress and compares them, rather than pinning the classes a
   * half-full bar happens to have today.
   */
  const shape = (bar: HTMLElement) => ({
    className: bar.className,
    accent: bar.style.getPropertyValue("--ui-accent"),
    fill: (bar.firstElementChild as HTMLElement).style.width,
    label: bar.textContent,
  });

  const albumBar = (over: Partial<AlbumSummary> = {}) => {
    const album = {
      id: "a1",
      title: "Kitchen heroes",
      coverKey: `img/${"a".repeat(64)}.jpg`,
      status: "in_progress",
      percent: 50,
      owned: 6,
      total: 12,
      remaining: 6,
      almostThere: false,
      unlockPrice: 100,
      unlockedAt: "x",
      affordable: true,
      ...over,
    } as AlbumSummary;
    const { unmount } = render(
      <MemoryRouter>
        <AlbumCard album={album} onUnlock={vi.fn()} />
      </MemoryRouter>,
    );
    const out = shape(screen.getByRole("progressbar"));
    unmount();
    return out;
  };

  const puzzleBar = (over: Partial<Puzzle> = {}) => {
    const { unmount } = card({ unlockedAt: "x", ownedCount: 3, ...over });
    const out = shape(screen.getByRole("progressbar"));
    unmount();
    return out;
  };

  it("is the same bar at the same progress", () => {
    // 3 of 6 pieces is 50%, the same as 6 of 12 stickers.
    expect(puzzleBar()).toEqual(albumBar());
  });

  it("is the same bar when it is finished", () => {
    expect(puzzleBar({ ownedCount: 6, completedAt: "2026-08-02T00:00:00Z" })).toEqual(
      albumBar({ status: "completed", percent: 100, owned: 12 }),
    );
  });
});
