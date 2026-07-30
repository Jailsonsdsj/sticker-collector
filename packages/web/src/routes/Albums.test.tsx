import type { AlbumSummary } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Albums } from "./Albums";

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
  balance = 1000;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") return json({ balance, spentCoins: 200 }, 201);
    if (url.startsWith("/api/albums?")) return json(albums);
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
    albums = [];
    render(<Albums />, { wrapper });
    await waitFor(() => expect(screen.getByText("No albums yet")).toBeInTheDocument());
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
