import type { AlbumSummary } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALBUMS_PER_PAGE, Albums, paginate } from "./Albums";

const COVER = `img/${"a".repeat(64)}.jpg`;

function album(over: Partial<AlbumSummary> = {}): AlbumSummary {
  return {
    id: "alb1",
    title: "Kitchen heroes",
    description: null,
    coverKey: COVER,
    derivedFromAlbumId: null,
    unlockPrice: 200,
    randomPrice: 40,
    prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
    odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
    hideLocked: false,
    lockedCoverKey: null,
    unlockedAt: null,
    completedAt: null,
    sealedAt: "2026-07-01T00:00:00Z",
    createdAt: "2026-07-01T00:00:00Z",
    editionNumber: 1,
    owned: 0,
    total: 12,
    percent: 0,
    status: "locked",
    remaining: 12,
    almostThere: false,
    affordable: true,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;
let albums: AlbumSummary[];
let puzzles: Record<string, unknown>[];
let balance: number;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/albums"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const albumCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url.startsWith("/api/albums?"));

const dialog = () => within(document.querySelector("dialog[open]") as HTMLElement);

beforeEach(() => {
  localStorage.clear();
  albums = [album()];
  puzzles = [];
  balance = 1000;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") return json({ balance, spentCoins: 200 }, 201);
    if (url.startsWith("/api/albums?")) return json(albums);
    if (url.startsWith("/api/puzzles")) return json(puzzles);
    if (url.startsWith("/api/wallet")) return json({ balance });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

async function open() {
  const user = userEvent.setup();
  render(<Albums />, { wrapper });
  await waitFor(() => expect(screen.getByText("Kitchen heroes")).toBeInTheDocument());
  return user;
}

describe("the shelf", () => {
  it("shows locked and unlocked albums together, with no store", async () => {
    albums = [
      album({ id: "a", title: "Locked one", status: "locked" }),
      album({ id: "b", title: "Open one", status: "in_progress", unlockedAt: "x", percent: 40 }),
    ];
    render(<Albums />, { wrapper });

    await waitFor(() => expect(screen.getByText("Locked one")).toBeInTheDocument());
    expect(screen.getByText("Open one")).toBeInTheDocument();
  });

  it("offers something to do when the shelf is empty", async () => {
    // "No albums yet" was wrong once the shelf started holding puzzles too.
    albums = [];
    render(<Albums />, { wrapper });
    await waitFor(() => expect(screen.getByText("Nothing here yet")).toBeInTheDocument());
  });

  it("says so when a filter matches nothing, rather than looking broken", async () => {
    const user = await open();
    albums = [];
    await user.click(screen.getByRole("tab", { name: "Done" }));
    await waitFor(() => expect(screen.getByText("Nothing here")).toBeInTheDocument());
  });
});

describe("the backup nudge", () => {
  it("asks for a backup on the shelf, where albums are made and finished", async () => {
    // Rendering the component in isolation proves nothing about whether the
    // user ever sees it.
    await open();
    expect(
      screen.getByRole("complementary", { name: "Back up your collection" }),
    ).toBeInTheDocument();
  });

  it("stays away once a backup is newer than every album", async () => {
    const { recordExport } = await import("../lib/backupState");
    recordExport("2030-01-01T00:00:00.000Z");

    await open();
    expect(
      screen.queryByRole("complementary", { name: "Back up your collection" }),
    ).not.toBeInTheDocument();
  });
});

describe("filtering and sorting", () => {
  it("asks the server for the chosen status", async () => {
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Locked" }));

    await waitFor(() => expect(albumCalls().some((u) => u.includes("status=locked"))).toBe(true));
  });

  it("does not send a status for All — that would hide albums", async () => {
    await open();
    expect(albumCalls()[0]).toContain("sort=status");
    expect(albumCalls()[0]).not.toContain("status=");
  });

  it("re-sorts without filtering", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Progress" }));

    await waitFor(() => {
      const last = albumCalls().at(-1) as string;
      expect(last).toContain("sort=progress");
      expect(last).not.toContain("status=");
    });
  });
});

describe("unlocking", () => {
  it("asks before spending, and sends nothing until confirmed", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Unlock 200" }));

    expect(dialog().getByText(/You will have/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
      false,
    );
  });

  it("spends once when confirmed", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Unlock 200" }));
    await user.click(dialog().getByRole("button", { name: "Spend 200" }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe("/api/albums/alb1/unlock");
    });
  });

  it("sends an idempotency key, so a retry cannot charge twice", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Unlock 200" }));
    await user.click(dialog().getByRole("button", { name: "Spend 200" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(post).toBeDefined();
      const headers = ((post as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBeTruthy();
    });
  });

  it("sends nothing when the dialog is dismissed", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Unlock 200" }));
    await user.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
      false,
    );
  });

  it("refuses to spend coins the user does not have", async () => {
    // The API would 402; refusing here explains the shortfall instead.
    balance = 10;
    albums = [album({ affordable: false })];
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Unlock 200" }));

    expect(dialog().getByRole("button", { name: "Not enough coins" })).toBeDisabled();
    expect(dialog().getByText(/Complete a few tasks/)).toBeInTheDocument();
  });

  it("refreshes the wallet as well as the shelf", async () => {
    // A stale balance on screen is contradicted by the very next purchase.
    const user = await open();
    const before = fetchMock.mock.calls.filter(([url]) =>
      (url as string).startsWith("/api/wallet"),
    ).length;

    await user.click(screen.getByRole("button", { name: "Unlock 200" }));
    await user.click(dialog().getByRole("button", { name: "Spend 200" }));

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(([url]) =>
        (url as string).startsWith("/api/wallet"),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

describe("an expired session", () => {
  it("goes to the login screen instead of showing an empty shelf", async () => {
    fetchMock.mockImplementation(async () => json({ error: "unauthorized" }, 401));
    render(<Albums />, { wrapper });

    await waitFor(() => expect(screen.queryByText("Albums")).not.toBeInTheDocument());
  });
});

describe("pagination", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      album({ id: `a${i}`, title: `Album ${String(i).padStart(2, "0")}` }),
    );

  /** The shared opener waits for the seed album, which these fixtures replace. */
  const openShelf = async () => {
    const user = userEvent.setup();
    render(<Albums />, { wrapper });
    await waitFor(() => expect(screen.getByText("Album 00")).toBeInTheDocument());
    return user;
  };

  it("stays out of the way when everything fits on one page", async () => {
    albums = many(ALBUMS_PER_PAGE);
    await openShelf();

    // Controls that can never do anything are noise on the screen they sit on.
    expect(screen.queryByRole("navigation", { name: "Album pages" })).not.toBeInTheDocument();
  });

  it("shows ten at a time", async () => {
    albums = many(23);
    await openShelf();

    expect(screen.getByText("Album 00")).toBeInTheDocument();
    expect(screen.getByText("Album 09")).toBeInTheDocument();
    expect(screen.queryByText("Album 10")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("walks forward and back", async () => {
    albums = many(23);
    const user = await openShelf();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Album 10")).toBeInTheDocument();
    expect(screen.queryByText("Album 00")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Album 00")).toBeInTheDocument();
  });

  it("stops at both ends", async () => {
    albums = many(23);
    const user = await openShelf();

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("leaves the last page short rather than padding it", async () => {
    albums = many(11);
    const user = await openShelf();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Album 10")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("returns to the first page when the filter changes", async () => {
    // Otherwise a narrower list leaves you on a page that no longer exists.
    albums = many(23);
    const user = await openShelf();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("tab", { name: "Locked" }));

    await waitFor(() => expect(screen.getByText("Album 00")).toBeInTheDocument());
  });
});

describe("paginate", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("cuts the list into pages of ten", () => {
    expect(paginate(rows(23), 0).visible).toHaveLength(ALBUMS_PER_PAGE);
    expect(paginate(rows(23), 0).pages).toBe(3);
  });

  it("leaves the last page short rather than padding it", () => {
    expect(paginate(rows(23), 2).visible).toEqual([20, 21, 22]);
  });

  it("reports one page for an empty shelf, not zero", () => {
    // Zero pages would render "1 of 0" and disable both controls forever.
    expect(paginate(rows(0), 0)).toMatchObject({ pages: 1, current: 0, visible: [] });
  });

  it("clamps a page that no longer exists", () => {
    // The case a refetch creates: you are on page 3, an album is deleted on
    // another device, and the list is now one page long. Without the clamp the
    // grid renders empty, which reads as "you have no albums".
    expect(paginate(rows(5), 2)).toMatchObject({ current: 0, visible: [0, 1, 2, 3, 4] });
  });

  it("clamps a negative page too", () => {
    expect(paginate(rows(5), -3).current).toBe(0);
  });
});

describe("the shelf holds puzzles too", () => {
  const puzzle = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    title: "The harbour",
    description: null,
    imageKey: `img/${"b".repeat(64)}.jpg`,
    unlockPrice: 100,
    piecePrice: 25,
    rows: 2,
    cols: 3,
    hideLocked: false,
    unlockedAt: null,
    completedAt: null,
    sealedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    ownedCount: 0,
    ...over,
  });

  it("shows one beside the albums, badged so you can tell them apart", async () => {
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });

    expect(await screen.findByText("The harbour")).toBeInTheDocument();
    expect(screen.getByText("Puzzle")).toBeInTheDocument();
  });

  it("filters one by the same tab that filters an album", async () => {
    const user = userEvent.setup();
    puzzles = [puzzle()];
    albums = [];
    render(<Albums />, { wrapper });
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("tab", { name: "Done" }));

    expect(screen.queryByText("The harbour")).not.toBeInTheDocument();
  });

  it("asks for a backup after one is made, not only after an album", async () => {
    // A puzzle's master image exists nowhere else, which makes it the most
    // irreplaceable thing the app holds.
    albums = [];
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });

    expect(
      await screen.findByRole("complementary", { name: "Back up your collection" }),
    ).toBeInTheDocument();
  });
});
