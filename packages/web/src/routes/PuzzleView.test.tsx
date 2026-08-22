import { MAX_PIECES_PER_UNLOCK, type PuzzleDetail } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PuzzleView } from "./PuzzleView";

/**
 * The board's own behaviour is `PuzzleBoard.test.tsx`; the arithmetic of the
 * transform is `lib/puzzleBoard.test.ts`. What is here is the money: what the
 * bar says, when the button is allowed, and what actually gets sent.
 */
let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const puzzle = (over: Partial<PuzzleDetail> = {}): PuzzleDetail => ({
  id: "p1",
  title: "The harbour",
  description: null,
  imageKey: `img/${"a".repeat(64)}.jpg`,
  imageWidth: 1536,
  imageHeight: 1024,
  unlockPrice: 100,
  piecePrice: 25,
  rows: 2,
  cols: 3,
  hideLocked: false,
  unlockedAt: "2026-08-01T00:00:00Z",
  completedAt: null,
  sealedAt: "2026-08-01T00:00:00Z",
  createdAt: "2026-08-01T00:00:00Z",
  ownedCount: 0,
  ownedPieces: [],
  ...over,
});

function open(board: PuzzleDetail = puzzle(), balance = 1000) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const read = (init?.method ?? "GET") === "GET";
    if (read && url.startsWith("/api/puzzles/")) return json(board);
    if (read && url.startsWith("/api/wallet")) return json({ balance });
    if (!read)
      return json({ balance, spentCoins: 0, puzzleId: "p1", pieces: [], completed: false }, 201);
    return json({});
  });
  const router = createMemoryRouter([{ path: "/puzzles/:id", element: <PuzzleView /> }], {
    initialEntries: ["/puzzles/p1"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Every tile, once the board has loaded. Anchored on the canvas rather than
 *  on a piece's name: at 144 pieces `/^Piece 1/` matches 1, 10, 11 and 12. */
const tiles = async () => {
  const canvas = await screen.findByTestId("puzzle-canvas");
  return [...canvas.querySelectorAll("button")];
};
const posted = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  return call ? { url: call[0] as string, body: JSON.parse(call[1].body as string) } : null;
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("a puzzle still locked", () => {
  it("offers to open it, at its own price", async () => {
    open(puzzle({ unlockedAt: null }));

    expect(await screen.findByRole("button", { name: "Unlock puzzle" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("will not sell a piece inside it", async () => {
    // The gate on the whole thing, mirrored from albums.
    open(puzzle({ unlockedAt: null }));

    for (const tile of await tiles()) expect(tile).toBeDisabled();
  });

  it("says so plainly when the wallet is short", async () => {
    open(puzzle({ unlockedAt: null }), 10);

    const button = await screen.findByRole("button", { name: "Not enough coins" });
    expect(button).toBeDisabled();
  });
});

describe("picking pieces", () => {
  it("shows the price once, on the bar, before anything is picked", async () => {
    // Never on a piece: the same number 144 times is noise.
    open();
    await tiles();

    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("adds the selection up", async () => {
    const user = userEvent.setup();
    open();
    const all = await tiles();

    await user.click(all[0] as HTMLElement);
    await user.click(all[1] as HTMLElement);

    expect(screen.getByText(/2 for/)).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("lets a piece be unpicked", async () => {
    const user = userEvent.setup();
    open();
    const all = await tiles();

    await user.click(all[0] as HTMLElement);
    await user.click(all[0] as HTMLElement);

    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("never offers a piece already owned", async () => {
    open(puzzle({ ownedPieces: [0], ownedCount: 1 }));
    const all = await tiles();

    expect(all[0]).toBeDisabled();
  });

  it("refuses to let the selection outrun the wallet", async () => {
    // The Worker answers 402, but a button that can only fail is a worse
    // button than one that is off.
    const user = userEvent.setup();
    open(puzzle(), 30);
    const all = await tiles();

    await user.click(all[0] as HTMLElement);
    await user.click(all[1] as HTMLElement);

    expect(screen.getByRole("button", { name: "Not enough coins" })).toBeDisabled();
  });
});

it("stops the selection at what one purchase can hold", async () => {
  // The cap is not a preference: the purchase is one batch — one payment and
  // one insert per piece — and that batch is the only all-or-nothing D1
  // offers. Past it the guarantee would have to be split across two.
  const user = userEvent.setup();
  open(puzzle({ rows: 12, cols: 12, piecePrice: 1 }));
  const all = await tiles();

  for (const tile of all.slice(0, MAX_PIECES_PER_UNLOCK + 1)) {
    await user.click(tile as HTMLElement);
  }

  expect(screen.getByText(new RegExp(`${MAX_PIECES_PER_UNLOCK} for`))).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/at a time/i);
});

describe("buying them", () => {
  it("sends the whole selection as one purchase", async () => {
    // One payment, one batch. Two requests could not fail together.
    const user = userEvent.setup();
    open();
    const all = await tiles();
    await user.click(all[2] as HTMLElement);
    await user.click(all[4] as HTMLElement);

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(posted()).not.toBeNull());
    expect(posted()?.url).toBe("/api/puzzles/p1/pieces");
    expect(posted()?.body.pieces.sort()).toEqual([2, 4]);
  });

  it("clears the selection once they are bought", async () => {
    const user = userEvent.setup();
    open();
    const all = await tiles();
    await user.click(all[0] as HTMLElement);

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled());
  });

  it("keeps the selection when the purchase fails", async () => {
    // Nothing was half-bought, so the picks are still worth something.
    const user = userEvent.setup();
    open();
    const all = await tiles();
    await user.click(all[0] as HTMLElement);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET"
        ? json(url.startsWith("/api/wallet") ? { balance: 1000 } : puzzle())
        : json({ error: "insufficient coins" }, 402),
    );

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText(/could not buy/i)).toBeInTheDocument();
    expect(screen.getByText(/1 for/)).toBeInTheDocument();
  });
});

describe("a puzzle already finished", () => {
  it("says so, and stops selling", async () => {
    open(puzzle({ completedAt: "2026-08-02T00:00:00Z", ownedPieces: [0, 1, 2, 3, 4, 5] }));

    expect(await screen.findByText(/picture is whole/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
  });
});

describe("deleting one", () => {
  it("asks you to type the title, like an album does", async () => {
    // The most destructive thing on this screen: the pieces bought and the
    // coins that bought them, gone, with no refund. A red button alone is
    // dismissed by muscle memory.
    const user = userEvent.setup();
    open(puzzle({ ownedPieces: [0, 1], ownedCount: 2 }));

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.getByText(/no coins are refunded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeDisabled();
  });

  it("says how much is being thrown away", async () => {
    const user = userEvent.setup();
    open(puzzle({ ownedPieces: [0, 1], ownedCount: 2 }));

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/pieces you have bought/i)).toBeInTheDocument();
  });

  it("goes through once the title matches", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await user.type(screen.getByLabelText(/type the puzzle's title/i), "the HARBOUR ");

    // Trimmed and case-insensitive: the point is intent, not typing accuracy.
    const confirm = screen.getByRole("button", { name: "Delete for good" });
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(call?.[0]).toBe("/api/puzzles/p1");
    });
  });
});

describe("the board takes the screen", () => {
  it("offers a way back to the whole picture", async () => {
    // Zoomed into a corner, the way out should not be off the picture.
    open();
    expect(await screen.findByRole("button", { name: "Fit" })).toBeInTheDocument();
  });

  it("Fit actually puts it back", async () => {
    // jsdom measures nothing, so the board is given a size to fit inside —
    // otherwise there is no view to reset and the button cannot be told from
    // one that does nothing.
    class Observer {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", Observer);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 600,
      top: 0,
      left: 0,
      right: 300,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const user = userEvent.setup();
    open();
    const canvas = await screen.findByTestId("puzzle-canvas");
    const board = canvas.parentElement as HTMLElement;
    // Wait for the measurement to land before reading the opening view — the
    // first paint is the unmeasured one.
    // A 1536x1024 picture fitted into a 300x600 board is 300x200, centred.
    const fitted = "translate(0px, 200px) scale(1)";
    await waitFor(() => expect(canvas.style.transform).toBe(fitted));

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(board, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(canvas.style.transform).not.toBe(fitted);

    await user.click(screen.getByRole("button", { name: "Fit" }));

    expect(canvas.style.transform).toBe(fitted);
  });

  it("keeps progress and the buy row in one bar, with nothing between them", async () => {
    // They used to be a screen apart — the bar pinned to the bottom, the
    // progress left at the end of the scrolling column — which read as two
    // unrelated things saying different numbers about the same puzzle.
    open(puzzle({ ownedPieces: [0], ownedCount: 1 }));
    await tiles();

    const bar = document.querySelector(".app-column.fixed") as HTMLElement;
    expect(bar).toContainElement(screen.getByRole("progressbar"));
    expect(bar).toContainElement(screen.getByRole("button", { name: "Unlock" }));
  });

  it("still shows progress once it is finished, with the buy row gone", async () => {
    open(puzzle({ completedAt: "2026-08-02T00:00:00Z", ownedPieces: [0, 1, 2, 3, 4, 5] }));

    expect(await screen.findByText(/picture is whole/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
  });
});
