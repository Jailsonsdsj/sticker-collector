import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PuzzleNew } from "./PuzzleNew";

/**
 * The real picker crops on a canvas, which jsdom does not have. Its only output
 * is the key of an image already stored, so a button that hands one over is the
 * same contract with the untestable half removed — and the picker has its own
 * tests for the half that is missing here.
 */
vi.mock("../components/wizard/ImagePicker", () => ({
  ImagePicker: ({
    label,
    onPicked,
  }: {
    label: string;
    onPicked: (key: string, size: { width: number; height: number }) => void;
  }) => (
    // A wide picture, because a puzzle now keeps the shape it arrived in.
    <button
      type="button"
      onClick={() => onPicked(`img/${"a".repeat(64)}.jpg`, { width: 1536, height: 864 })}
    >
      {label}
    </button>
  ),
}));

/**
 * The screen, not the rules — those are `lib/puzzleDraft.ts`, tested without a
 * DOM. What matters here is the wiring: that the form cannot be submitted
 * before it is ready, that the sealed-forever warning is on screen before the
 * button rather than after it, and that the request carries the count.
 */

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  const router = createMemoryRouter(
    [
      { path: "/puzzles/new", element: children },
      { path: "/puzzles/:id", element: <p>the board</p> },
    ],
    { initialEntries: ["/puzzles/new"] },
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") return json({ id: "p1" }, 201);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const open = () => render(<PuzzleNew />, { wrapper });
const seal = () => screen.getByRole("button", { name: "Create puzzle" });
const posted = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  return call ? JSON.parse(call[1].body as string) : null;
};

describe("before it can be made", () => {
  it("will not seal an empty form", () => {
    open();
    expect(seal()).toBeDisabled();
  });

  it("says what is missing, one thing at a time", async () => {
    // A list of every fault at once is a wall of red on a form barely started.
    const user = userEvent.setup();
    open();

    expect(screen.getByRole("alert")).toHaveTextContent(/title is required/i);
    await user.type(screen.getByLabelText(/title/i), "The harbour");
    expect(screen.getByRole("alert")).toHaveTextContent(/picture/i);
  });

  it("stays disabled with a title but no picture", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText(/title/i), "The harbour");

    expect(seal()).toBeDisabled();
  });
});

describe("the choices it puts in front of you", () => {
  it("shows the cut for the count that is selected", () => {
    // The form opens on 144, which is 12 × 12, and the author should see the
    // shape before sealing.
    open();
    expect(screen.getByText(/cut 12 × 12/)).toBeInTheDocument();
  });

  it("re-cuts when the count changes", async () => {
    // Away from the default, deliberately. Clicking the preset the form already
    // opens on would assert the starting state and call it a change.
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "48" }));

    expect(screen.getByText(/cut 6 × 8/)).toBeInTheDocument();
  });

  it("adds up what finishing it will cost", async () => {
    // Two small numbers multiply into a large one, and the prices are fixed
    // the moment it is made.
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "12" }));

    // 1000 to unlock, 12 pieces at 150.
    expect(screen.getByText("2800")).toBeInTheDocument();
  });

  it("warns that there is no edit, before the button rather than after", () => {
    open();
    expect(screen.getByText(/never edit it/i)).toBeInTheDocument();
  });
});

describe("making it", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/title/i), "The harbour");
    await user.click(screen.getByRole("button", { name: "Choose a picture" }));
  };

  it("turns the button on once the picture is in", async () => {
    const user = userEvent.setup();
    open();
    expect(seal()).toBeDisabled();

    await fill(user);

    expect(seal()).toBeEnabled();
  });

  it("sends the piece count, never a grid", async () => {
    // One source of truth for the cut: the server derives rows and cols and
    // stores them, so two implementations can never disagree about one puzzle.
    const user = userEvent.setup();
    open();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "96" }));

    await user.click(seal());

    await waitFor(() => expect(posted()).not.toBeNull());
    expect(posted()).toMatchObject({ title: "The harbour", pieces: 96 });
    expect(posted()).not.toHaveProperty("rows");
  });

  it("sends the prices as numbers, having held them as text", async () => {
    const user = userEvent.setup();
    open();
    await fill(user);

    await user.click(seal());

    await waitFor(() => expect(posted()).not.toBeNull());
    expect(posted()).toMatchObject({
      unlockPrice: 1000,
      piecePrice: 150,
      randomPrice: 100,
      hideLocked: false,
    });
  });

  it("carries the hide-locked choice", async () => {
    const user = userEvent.setup();
    open();
    await fill(user);
    await user.click(screen.getByRole("checkbox"));

    await user.click(seal());

    await waitFor(() => expect(posted()).not.toBeNull());
    expect(posted()).toMatchObject({ hideLocked: true });
  });

  it("goes straight to the board it just made", async () => {
    // The first question after making a puzzle is what it looks like cut up.
    const user = userEvent.setup();
    open();
    await fill(user);

    await user.click(seal());

    expect(await screen.findByText("the board")).toBeInTheDocument();
  });

  it("stays put when the save fails, so the work is not lost", async () => {
    // The image is uploaded and the prices are typed. Closing costs both.
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "POST" ? json({ error: "nope" }, 500) : json({}),
    );
    const user = userEvent.setup();
    open();
    await fill(user);

    await user.click(seal());

    expect(await screen.findByText(/could not create/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue("The harbour");
  });
});
