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

/** The listing reads a handful of a puzzle's fields; these are those. */
const aPuzzle = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "The harbour",
  description: null,
  imageKey: `img/${"b".repeat(64)}.jpg`,
  imageWidth: 1536,
  imageHeight: 1024,
  unlockPrice: 100,
  piecePrice: 25,
  randomPrice: 0,
  rows: 2,
  cols: 3,
  hideLocked: false,
  unlockedAt: "2026-08-01T00:00:00Z",
  completedAt: null,
  sealedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  ownedCount: 1,
  ...over,
});

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

/**
 * Switches an already-rendered shelf to All.
 *
 * The shelf **opens on Collecting**, and most of what is tested in this file —
 * unlocking, pagination, the backup nudge, the puzzle cards — uses locked
 * fixtures that Collecting hides by design. Switching once keeps those tests
 * about their own subject rather than about the tab they happen to land on.
 * The tests that ARE about the landing tab do not call this.
 */
const showAll = () => userEvent.setup().click(screen.getByRole("tab", { name: "All" }));

async function open() {
  const user = userEvent.setup();
  render(<Albums />, { wrapper });
  await showAll();
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
    await showAll();

    await waitFor(() => expect(screen.getByText("Locked one")).toBeInTheDocument());
    expect(screen.getByText("Open one")).toBeInTheDocument();
  });

  it("offers something to do when the shelf is empty", async () => {
    // "No albums yet" was wrong once the shelf started holding puzzles too.
    albums = [];
    render(<Albums />, { wrapper });
    await showAll();
    await waitFor(() => expect(screen.getByText("Nothing here yet")).toBeInTheDocument());
  });

  it("says so when a filter matches nothing, rather than looking broken", async () => {
    const user = await open();
    albums = [];
    await user.click(screen.getByRole("tab", { name: "Done" }));
    await waitFor(() => expect(screen.getByText("Nothing here")).toBeInTheDocument());
  });
});

describe("the tab it opens on", () => {
  it("lands on Collecting, not on everything", async () => {
    // What you came to look at is the thing you are part-way through.
    render(<Albums />, { wrapper });

    const collecting = await screen.findByRole("tab", { name: "Collecting" });
    expect(collecting).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });

  it("asks for every status, because Collecting spans two of them", async () => {
    // `?status=` takes one value and Collecting shows in-progress *and*
    // finished, so asking for either one would silently drop the other half of
    // the tab. The narrowing happens in `shelf`.
    render(<Albums />, { wrapper });

    await waitFor(() => expect(albumCalls()[0]).toBeDefined());
    expect(albumCalls()[0]).not.toContain("status=");
  });

  it("shows what is on the go and what is finished, and hides what is shut", async () => {
    // A finished collection stays on the tab the app opens on: the work is the
    // same work, and hiding it the moment the last sticker lands makes the
    // shelf emptier the more you have done.
    albums = [
      album({ id: "a", title: "Locked one", status: "locked" }),
      album({ id: "b", title: "Open one", status: "in_progress", unlockedAt: "x", percent: 40 }),
      album({ id: "c", title: "Finished one", status: "completed", percent: 100 }),
    ];
    render(<Albums />, { wrapper });

    expect(await screen.findByText("Open one")).toBeInTheDocument();
    expect(screen.getByText("Finished one")).toBeInTheDocument();
    expect(screen.queryByText("Locked one")).not.toBeInTheDocument();
  });

  it("keeps Done as the narrower question", async () => {
    const user = userEvent.setup();
    albums = [
      album({ id: "b", title: "Open one", status: "in_progress", unlockedAt: "x", percent: 40 }),
      album({ id: "c", title: "Finished one", status: "completed", percent: 100 }),
    ];
    render(<Albums />, { wrapper });
    await screen.findByText("Open one");

    await user.click(screen.getByRole("tab", { name: "Done" }));

    await waitFor(() => expect(screen.queryByText("Open one")).not.toBeInTheDocument());
    expect(screen.getByText("Finished one")).toBeInTheDocument();
  });

  it("puts the tabs in the order they are worth reading", async () => {
    // Collecting first because it is where you land; All in the middle rather
    // than at the head, since it is the escape hatch and not the destination.
    render(<Albums />, { wrapper });

    const labels = (await screen.findAllByRole("tab")).map((tab) => tab.textContent);
    expect(labels).toEqual(["Collecting", "Locked", "All", "Done"]);
  });

  it("points somewhere when nothing is on the go, rather than dead-ending", async () => {
    // Collecting is a landing screen now. "Nothing has that status right now"
    // is a true sentence and a dead end on the first thing the user sees.
    albums = [album({ status: "locked" })];
    render(<Albums />, { wrapper });

    expect(await screen.findByText("Nothing on the go")).toBeInTheDocument();
    expect(screen.getByText(/Open one from Locked/i)).toBeInTheDocument();
  });

  it("still says the collection is empty when it is, over on All", async () => {
    albums = [];
    render(<Albums />, { wrapper });
    await showAll();

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });
});

describe("searching the shelf", () => {
  const typed = async (text: string) => {
    const user = userEvent.setup();
    render(<Albums />, { wrapper });
    await showAll();
    await user.type(screen.getByRole("searchbox", { name: /search your collection/i }), text);
    return user;
  };

  it("sits between the tabs and the chip rows", async () => {
    // Position is the request, so it is the assertion. Under the tabs, which
    // say which shelf you are looking at; above the chips, which decide what is
    // shown of it and in what order.
    render(<Albums />, { wrapper });

    const box = await screen.findByRole("searchbox", { name: /search your collection/i });
    const tab = screen.getByRole("tab", { name: "Collecting" });
    const kind = screen.getByRole("button", { name: "Both" });
    const sort = screen.getByRole("button", { name: "Newest" });

    // Node.DOCUMENT_POSITION_FOLLOWING is 4.
    expect(tab.compareDocumentPosition(box) & 4).toBeTruthy();
    expect(box.compareDocumentPosition(kind) & 4).toBeTruthy();
    expect(box.compareDocumentPosition(sort) & 4).toBeTruthy();
  });

  it("narrows to what matches, and drops what does not", async () => {
    albums = [
      album({ id: "a", title: "Kitchen heroes" }),
      album({ id: "b", title: "Garden birds" }),
    ];
    await typed("garden");

    await waitFor(() => expect(screen.queryByText("Kitchen heroes")).not.toBeInTheDocument());
    expect(screen.getByText("Garden birds")).toBeInTheDocument();
  });

  it("finds a puzzle by the same box that finds an album", async () => {
    // `puzzle()` belongs to the describe below; the shelf only reads a handful
    // of these fields, so the literal is honest here.
    albums = [album({ title: "Kitchen heroes" })];
    puzzles = [
      {
        id: "p1",
        title: "The harbour",
        description: null,
        imageKey: `img/${"b".repeat(64)}.jpg`,
        unlockPrice: 100,
        piecePrice: 25,
        randomPrice: 0,
        rows: 2,
        cols: 3,
        hideLocked: false,
        unlockedAt: "2026-08-01T00:00:00Z",
        completedAt: null,
        sealedAt: "2026-09-01T00:00:00Z",
        createdAt: "2026-09-01T00:00:00Z",
        ownedCount: 1,
      },
    ];
    await typed("harbour");

    await waitFor(() => expect(screen.queryByText("Kitchen heroes")).not.toBeInTheDocument());
    expect(screen.getByText("The harbour")).toBeInTheDocument();
  });

  it("gives everything back when the box is cleared", async () => {
    albums = [
      album({ id: "a", title: "Kitchen heroes" }),
      album({ id: "b", title: "Garden birds" }),
    ];
    const user = await typed("garden");
    await waitFor(() => expect(screen.queryByText("Kitchen heroes")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(await screen.findByText("Kitchen heroes")).toBeInTheDocument();
  });

  it("says the search came up empty, not that the collection is", async () => {
    // "Make one, then earn your way through it" is the wrong answer to someone
    // who has forty albums and typed a typo.
    albums = [album({ title: "Kitchen heroes" })];
    await typed("zzz");

    expect(await screen.findByText("Nothing here matches that")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("offers the way back out of a search that found nothing", async () => {
    albums = [album({ title: "Kitchen heroes" })];
    const user = await typed("zzz");

    await user.click(screen.getByRole("button", { name: "Clear the search" }));

    expect(await screen.findByText("Kitchen heroes")).toBeInTheDocument();
  });

  it("still says the collection is empty when it actually is", async () => {
    // An empty shelf and a search with no hits are different problems, and the
    // no-match copy would tell a new user their typing was the trouble.
    albums = [];
    render(<Albums />, { wrapper });
    await showAll();

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("goes back to the first page, since page 3 of the old list is not page 3 of the new", async () => {
    const user = userEvent.setup();
    albums = Array.from({ length: 12 }, (_, i) =>
      album({ id: `a${i}`, title: `Album ${String(i).padStart(2, "0")}` }),
    );
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("Album 00");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("2 of 2")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: /search your collection/i }), "Album");

    await waitFor(() => expect(screen.getByText("Album 00")).toBeInTheDocument());
  });

  it("searches inside the tab rather than escaping it", async () => {
    // The search refines the view. Finding a locked album while Collecting is
    // selected would make the chosen tab a lie.
    albums = [
      album({ id: "a", title: "Shut one", status: "locked" }),
      album({ id: "b", title: "Shut two", status: "locked" }),
    ];
    const user = userEvent.setup();
    render(<Albums />, { wrapper });
    await user.type(screen.getByRole("searchbox", { name: /search your collection/i }), "Shut one");

    await waitFor(() => expect(screen.queryByText("Shut one")).not.toBeInTheDocument());
  });
});

describe("what the screen is called", () => {
  it("is the Collection, not the Albums", async () => {
    // It has held puzzles since P9-06. A heading naming one of the two kinds
    // reads as the other being a guest there.
    render(<Albums />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Collection" })).toBeInTheDocument();
  });
});

describe("showing one kind of thing", () => {
  const both = async () => {
    const user = userEvent.setup();
    albums = [album({ title: "Kitchen heroes", status: "in_progress", unlockedAt: "x" })];
    puzzles = [aPuzzle()];
    render(<Albums />, { wrapper });
    await screen.findByText("Kitchen heroes");
    return user;
  };

  it("offers the two kinds the shelf actually holds", async () => {
    render(<Albums />, { wrapper });

    expect(await screen.findByRole("button", { name: "Both" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Albums" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Puzzles" })).toBeInTheDocument();
  });

  it("shows both until asked otherwise", async () => {
    await both();

    expect(screen.getByText("Kitchen heroes")).toBeInTheDocument();
    expect(screen.getByText("The harbour")).toBeInTheDocument();
  });

  it("drops the puzzles when asked for albums", async () => {
    const user = await both();

    await user.click(screen.getByRole("button", { name: "Albums" }));

    await waitFor(() => expect(screen.queryByText("The harbour")).not.toBeInTheDocument());
    expect(screen.getByText("Kitchen heroes")).toBeInTheDocument();
  });

  it("drops the albums when asked for puzzles", async () => {
    const user = await both();

    await user.click(screen.getByRole("button", { name: "Puzzles" }));

    await waitFor(() => expect(screen.queryByText("Kitchen heroes")).not.toBeInTheDocument());
    expect(screen.getByText("The harbour")).toBeInTheDocument();
  });

  it("narrows the tab rather than replacing it", async () => {
    // Status and kind are two questions asked at once. A kind chip that reset
    // the tab, or a tab that reset the kind, would answer one of them only.
    const user = userEvent.setup();
    albums = [
      album({ id: "a", title: "Shut album", status: "locked" }),
      album({ id: "b", title: "Open album", status: "in_progress", unlockedAt: "x" }),
    ];
    puzzles = [aPuzzle()];
    render(<Albums />, { wrapper });
    await screen.findByText("Open album");

    await user.click(screen.getByRole("button", { name: "Albums" }));
    await user.click(screen.getByRole("tab", { name: "Locked" }));

    await waitFor(() => expect(screen.getByText("Shut album")).toBeInTheDocument());
    expect(screen.queryByText("Open album")).not.toBeInTheDocument();
    expect(screen.queryByText("The harbour")).not.toBeInTheDocument();
  });

  it("says which kind is missing, not that the tab is empty", async () => {
    // The tab has an album on it. "Nothing here" would blame the tab for what
    // the kind chip did.
    const user = userEvent.setup();
    albums = [album({ title: "Shut album", status: "locked" })];
    puzzles = [aPuzzle()]; // in progress, so not on Locked
    render(<Albums />, { wrapper });
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("tab", { name: "Locked" }));
    await screen.findByText("Shut album");
    await user.click(screen.getByRole("button", { name: "Puzzles" }));

    expect(await screen.findByText("No puzzles here")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
  });

  it("goes back to the first page, since the list just got shorter", async () => {
    const user = userEvent.setup();
    albums = Array.from({ length: 12 }, (_, i) =>
      album({
        id: `a${i}`,
        title: `Album ${String(i).padStart(2, "0")}`,
        status: "in_progress",
        unlockedAt: "x",
      }),
    );
    render(<Albums />, { wrapper });
    await screen.findByText("Album 00");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Albums" }));

    await waitFor(() => expect(screen.getByText("Album 00")).toBeInTheDocument());
  });

  it("composes with the search rather than fighting it", async () => {
    const user = await both();

    await user.click(screen.getByRole("button", { name: "Albums" }));
    await user.type(screen.getByRole("searchbox", { name: /search your collection/i }), "kitchen");

    await waitFor(() => expect(screen.getByText("Kitchen heroes")).toBeInTheDocument());
    expect(screen.queryByText("The harbour")).not.toBeInTheDocument();
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
    // The LAST call, not the first: the shelf opens on Collecting, so the
    // first thing it ever asks for is `status=in_progress`.
    await open();
    const last = albumCalls().at(-1) as string;
    expect(last).toContain("sort=status");
    expect(last).not.toContain("status=");
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
    await showAll();

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
    await showAll();
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
    await showAll();

    expect(await screen.findByText("The harbour")).toBeInTheDocument();
    expect(screen.getByText("Puzzle")).toBeInTheDocument();
  });

  it("filters one by the same tab that filters an album", async () => {
    const user = userEvent.setup();
    puzzles = [puzzle()];
    albums = [];
    render(<Albums />, { wrapper });
    await showAll();
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
    await showAll();

    expect(
      await screen.findByRole("complementary", { name: "Back up your collection" }),
    ).toBeInTheDocument();
  });
  it("opens a locked one from the shelf, the same way an album opens", async () => {
    // It used to say `Locked · 100` and send you to the board. Two cards in one
    // grid where only one can be bought where it sits is a difference the user
    // has to learn for no reason.
    const user = userEvent.setup();
    albums = [];
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("button", { name: "Unlock 100" }));
    await user.click(dialog().getByRole("button", { name: "Spend 100" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/puzzles/p1/unlock",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("asks before spending, rather than buying on the tap", async () => {
    // The ledger is append-only: a mis-tap costs coins no undo can return.
    const user = userEvent.setup();
    albums = [];
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("button", { name: "Unlock 100" }));

    expect(dialog().getByRole("button", { name: "Spend 100" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("names the puzzle in the confirmation, not the album beside it", async () => {
    const user = userEvent.setup();
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("button", { name: "Unlock 100" }));

    expect(dialog().getByText("Unlock The harbour?")).toBeInTheDocument();
  });

  it("marks one the wallet could open, and leaves one it could not", async () => {
    // An album's affordability arrives computed by the server; a puzzle's is
    // worked out here against the wallet this screen already holds. Getting
    // that arithmetic wrong marks every puzzle as affordable, which is exactly
    // as useful as marking none of them.
    albums = [];
    balance = 1000;
    puzzles = [
      puzzle({ id: "cheap", title: "Cheap one", unlockPrice: 100 }),
      puzzle({ id: "dear", title: "Dear one", unlockPrice: 5000 }),
    ];
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("Cheap one");

    expect(screen.getByRole("button", { name: "Unlock 100" }).className).toContain("shadow-coin");
    expect(screen.getByRole("button", { name: "Unlock 5000" }).className).not.toContain(
      "shadow-coin",
    );
  });

  it("says the coins are short when they are, and spends nothing", async () => {
    const user = userEvent.setup();
    balance = 20;
    albums = [];
    puzzles = [puzzle()];
    render(<Albums />, { wrapper });
    await showAll();
    await screen.findByText("The harbour");

    await user.click(screen.getByRole("button", { name: "Unlock 100" }));

    expect(dialog().getByRole("button", { name: "Not enough coins" })).toBeDisabled();
  });
});
