import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PuzzleBoard } from "./PuzzleBoard";

/**
 * jsdom has no layout, so the transform's *arithmetic* is tested in
 * `lib/puzzleBoard.test.ts` where it needs no DOM. What is testable here is the
 * cut: that every tile is a window onto one image, that a locked piece is
 * drained and bordered while an owned one is bare, and that a drag does not
 * count as a tap on whatever tile it happens to end over.
 */
const KEY = `img/${"a".repeat(64)}.jpg`;
const GRID = { rows: 2, cols: 3 };
/** A 3:2 picture, matching the 2x3 grid above. */
const IMAGE = { width: 1500, height: 1000 };

const view = (props: Partial<Parameters<typeof PuzzleBoard>[0]> = {}) =>
  render(
    <PuzzleBoard
      imageKey={KEY}
      image={IMAGE}
      grid={GRID}
      owned={new Set<number>()}
      hideLocked={false}
      {...props}
    />,
  );

const pieces = () => screen.getAllByRole("button");

describe("the cut", () => {
  it("draws one tile per piece", () => {
    view();
    expect(pieces()).toHaveLength(6);
  });

  it("makes every tile a window onto the same image", () => {
    // Not 144 pictures: one picture, 144 times, each showing its own part. It
    // is what makes the unlocked pieces line up exactly rather than nearly.
    view();
    for (const piece of pieces()) {
      expect(piece.style.backgroundImage).toContain(KEY);
      // The master blown up to the size of the whole board.
      expect(piece.style.backgroundSize).toBe("300% 200%");
    }
  });

  it("slides each tile to its own share of the picture", () => {
    view();
    const [first, , third, fourth] = pieces();

    expect(first?.style.backgroundPosition).toBe("0% 0%");
    // Last column of a 3-wide grid is the right edge.
    expect(third?.style.backgroundPosition).toBe("100% 0%");
    // First of the second row: back to the left, down to the bottom edge.
    expect(fourth?.style.backgroundPosition).toBe("0% 100%");
  });
});

describe("locked and owned", () => {
  it("drains a locked piece with a filter, never a second image", () => {
    view();
    expect(pieces()[0]?.style.filter).toContain("grayscale(1)");
  });

  it("leaves an owned piece in full colour, with no border", () => {
    // Requirement seven: remove the borders and the picture is whole.
    view({ owned: new Set([0]) });
    const [first, second] = pieces();

    expect(first?.style.filter).toBe("");
    expect(first?.className).not.toContain("inset_0_0_0_1px");
    expect(second?.className).toContain("inset_0_0_0_1px");
  });

  it("shows nothing at all for a locked piece when hiding is on", () => {
    // The other half of the author's choice: grayscale art, or no art.
    view({ hideLocked: true });
    expect(pieces()[0]?.style.backgroundImage).toBe("");
  });

  it("still shows an owned piece when hiding is on", () => {
    view({ hideLocked: true, owned: new Set([2]) });
    expect(pieces()[2]?.style.backgroundImage).toContain(KEY);
  });

  it("says which pieces are yours, not only in colour", () => {
    view({ owned: new Set([1]) });
    expect(screen.getByRole("button", { name: "Piece 2, yours" })).toBeInTheDocument();
  });
});

describe("showing what is picked", () => {
  it("lifts a picked piece out of the grey, not only rings it", () => {
    // A 2px ring on a small dark tile at 1x was invisible, and not being able
    // to tell what you have picked is fatal on a screen whose job is picking.
    view({ onPick: vi.fn(), selected: new Set([1]) });
    const [first, second] = pieces();

    expect(second?.style.filter).toBe("grayscale(1) brightness(1)");
    expect(first?.style.filter).toBe("grayscale(1) brightness(0.3)");
    expect(second?.className).toContain("inset_0_0_0_3px");
  });

  it("says it is picked, not only shows it", () => {
    view({ onPick: vi.fn(), selected: new Set([1]) });

    expect(pieces()[1]).toHaveAttribute("aria-pressed", "true");
    expect(pieces()[0]).toHaveAttribute("aria-pressed", "false");
  });
});

describe("picking a piece", () => {
  it("hands back the one that was tapped", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    view({ onPick });

    await user.click(pieces()[4] as HTMLElement);

    expect(onPick).toHaveBeenCalledWith(4);
  });

  it("never offers a piece already owned", async () => {
    // Buying it twice would take the coins and grant nothing.
    const onPick = vi.fn();
    view({ onPick, owned: new Set([0]) });

    expect(pieces()[0]).toBeDisabled();
  });

  it("is inert with no handler, which is a board you are only looking at", () => {
    view();
    expect(pieces()[0]).toBeDisabled();
  });

  it("does not count the end of a drag as a tap", () => {
    // A drag ends over some tile and that tile's click fires. Without this,
    // every pan buys whatever piece the finger lifted over.
    const onPick = vi.fn();
    const { container } = view({ onPick });
    const board = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 80, clientY: 0 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 80, clientY: 0 });
    fireEvent.click(pieces()[0] as HTMLElement);

    expect(onPick).not.toHaveBeenCalled();
  });

  it("still counts a tap that wobbled a pixel or two", () => {
    // A finger never lands and lifts on exactly one pixel.
    const onPick = vi.fn();
    const { container } = view({ onPick });
    const board = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.click(pieces()[0] as HTMLElement);

    expect(onPick).toHaveBeenCalledWith(0);
  });
});

describe("gestures belong to the board", () => {
  it("survives an engine with no pointer capture", () => {
    // jsdom has none, and neither do some older browsers. Calling it unguarded
    // throws out of the handler and takes the whole gesture with it.
    const { container } = view({ onPick: vi.fn() });
    const board = container.firstElementChild as HTMLElement;

    expect(() =>
      fireEvent.pointerDown(board, { pointerId: 1, clientX: 5, clientY: 5 }),
    ).not.toThrow();
  });

  it("takes touch away from the browser, or the page scrolls instead", () => {
    // The sticker viewer shipped this bug from the other side: the page moved
    // while the thing being dragged stayed put.
    const { container } = view();
    expect((container.firstElementChild as HTMLElement).className).toContain("touch-none");
  });

  it("starts showing the whole picture", () => {
    view();
    expect(screen.getByTestId("puzzle-canvas").style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });
});

describe("putting the picture back", () => {
  /**
   * jsdom measures nothing and has no `ResizeObserver`, so the board never
   * learns its own size and never fits. Both are stubbed here because the
   * behaviour under test — "reset returns to the opening view" — is only
   * reachable once the board has been measured at all.
   */
  const measured = (width: number, height: number) => {
    class Observer {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", Observer);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  };

  const transform = () => screen.getByTestId("puzzle-canvas").style.transform;

  it("keeps the picture's own shape inside a frame that is not", () => {
    // A 3:2 picture in a 300x600 board fits to 300x200 — it is never stretched
    // to the screen. An `inset-0` layer would take the frame's shape and shear
    // the cut, which is the whole reason the canvas is sized in pixels.
    measured(300, 600);
    view();
    const canvas = screen.getByTestId("puzzle-canvas");

    expect(canvas.style.width).toBe("300px");
    expect(canvas.style.height).toBe("200px");
  });

  it("opens with the picture centred in a frame taller than it is", () => {
    // A phone. The picture fits to 300x200 in a 300x600 board, so it sits 200
    // down rather than jammed against the top with a void beneath it.
    measured(300, 600);
    view();

    expect(transform()).toBe("translate(0px, 200px) scale(1)");
  });

  it("comes back to exactly that after being dragged away", () => {
    measured(300, 600);
    const { rerender } = render(
      <PuzzleBoard
        imageKey={KEY}
        image={IMAGE}
        grid={GRID}
        owned={new Set<number>()}
        hideLocked={false}
        resetToken={0}
      />,
    );
    const board = screen.getByTestId("puzzle-canvas").parentElement as HTMLElement;

    // Zoom in, so there is somewhere to be lost.
    fireEvent.pointerDown(board, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(board, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(transform()).not.toBe("translate(0px, 200px) scale(1)");

    rerender(
      <PuzzleBoard
        imageKey={KEY}
        image={IMAGE}
        grid={GRID}
        owned={new Set<number>()}
        hideLocked={false}
        resetToken={1}
      />,
    );

    expect(transform()).toBe("translate(0px, 200px) scale(1)");
  });

  it("resets again on a second press, not only the first", () => {
    // A counter rather than a boolean, for exactly this.
    measured(300, 600);
    const props = {
      imageKey: KEY,
      image: IMAGE,
      grid: GRID,
      owned: new Set<number>(),
      hideLocked: false,
    };
    const { rerender } = render(<PuzzleBoard {...props} resetToken={1} />);
    const board = screen.getByTestId("puzzle-canvas").parentElement as HTMLElement;

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(board, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(transform()).not.toBe("translate(0px, 200px) scale(1)");

    rerender(<PuzzleBoard {...props} resetToken={2} />);

    expect(transform()).toBe("translate(0px, 200px) scale(1)");
  });
});

describe("finding a tile from outside", () => {
  it("labels each tile with its index, so a landing can find it", () => {
    // An attribute rather than an id: ids are unique per document, and the same
    // board can be mounted twice while a route transitions.
    view();

    expect(pieces()[3]).toHaveAttribute("data-piece-index", "3");
  });
});
