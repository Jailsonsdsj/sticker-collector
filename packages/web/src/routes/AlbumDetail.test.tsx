import type { AlbumDetail as AlbumDetailBody, OwnedSticker } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlbumDetail } from "./AlbumDetail";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

function slot(over: Partial<OwnedSticker> = {}): OwnedSticker {
  return {
    id: `stk${over.slotIndex ?? 0}`,
    albumId: "alb1",
    imageKey: key((over.slotIndex ?? 0) + 1),
    tier: "common",
    slotIndex: 0,
    quantity: 0,
    ...over,
  };
}

function body(
  over: Partial<AlbumDetailBody["album"]> = {},
  stickers?: OwnedSticker[],
): AlbumDetailBody {
  const slots = stickers ?? [
    slot({ slotIndex: 0, tier: "common", quantity: 1 }),
    slot({ slotIndex: 1, tier: "rare", quantity: 0 }),
    slot({ slotIndex: 2, tier: "legendary", quantity: 3 }),
    slot({ slotIndex: 3, tier: "epic", quantity: 0 }),
  ];
  return {
    album: {
      id: "alb1",
      title: "Kitchen heroes",
      description: null,
      coverKey: key(999),
      derivedFromAlbumId: null,
      unlockPrice: 200,
      randomPrice: 40,
      prices: { common: 10, rare: 20, epic: 30, legendary: 400 },
      odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
      unlockedAt: "2026-07-02T00:00:00Z",
      completedAt: null,
      sealedAt: "2026-07-01T00:00:00Z",
      createdAt: "2026-07-01T00:00:00Z",
      editionNumber: 1,
      owned: slots.filter((s) => s.quantity > 0).length,
      total: slots.length,
      percent: 50,
      status: "in_progress",
      remaining: 2,
      almostThere: true,
      affordable: false,
      ...over,
    },
    stickers: slots,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;
let detail: AlbumDetailBody;
let balance: number;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/albums/alb1"]}>
        <Routes>
          <Route path="/albums/:id" element={children} />
          <Route path="/albums" element={<p>the shelf</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  detail = body();
  balance = 1000;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") return json({ balance, spentCoins: 10 }, 201);
    if (url.startsWith("/api/albums/")) return json(detail);
    if (url.startsWith("/api/wallet")) return json({ balance });
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

async function open() {
  const user = userEvent.setup();
  render(<AlbumDetail />, { wrapper });
  // The heading specifically: a closed <dialog> stays in the DOM under jsdom,
  // and the delete confirmation echoes the album title inside it.
  await screen.findByRole("heading", { name: "Kitchen heroes" });
  return user;
}

const slots = () => [...document.querySelectorAll("[data-tier]")];

describe("the grid", () => {
  it("shows every slot, including the empty ones", async () => {
    // A locked slot still has to render its rarity frame, so it cannot be left
    // out just because it is unowned.
    await open();
    expect(slots()).toHaveLength(4);
    expect(slots().filter((el) => el.getAttribute("data-owned") === "false")).toHaveLength(2);
  });

  it("keeps the album's stored slot order", async () => {
    await open();
    expect(slots().map((el) => el.getAttribute("data-tier"))).toEqual([
      "common",
      "rare",
      "legendary",
      "epic",
    ]);
  });

  it("counts duplicates on the slot that has them", async () => {
    await open();
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("reports progress from the server, not from a recount", async () => {
    await open();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/2 of 4 collected/)).toBeInTheDocument();
  });
});

describe("browsing a locked album", () => {
  it("shows everything it holds, and sells nothing", async () => {
    detail = body({ status: "locked", unlockedAt: null, percent: 0, owned: 0 });
    await open();

    expect(slots()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Buy/ })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing can be bought/)).toBeInTheDocument();
  });
});

describe("buying a sticker", () => {
  it("posts once, to that sticker", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /Buy rare sticker for 20/ }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe("/api/albums/alb1/stickers/stk1/buy");
    });
  });

  it("prices each slot by its own tier", async () => {
    await open();
    expect(screen.getByRole("button", { name: /Buy rare sticker for 20/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy epic sticker for 30/ })).toBeInTheDocument();
  });

  it("refuses what the balance cannot cover", async () => {
    balance = 25; // enough for the rare at 20, not the epic at 30
    await open();

    expect(screen.getByRole("button", { name: /Buy rare sticker for 20/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Buy epic sticker for 30/ })).toBeDisabled();
  });

  it("refreshes the wallet as well as the album", async () => {
    const user = await open();
    const before = fetchMock.mock.calls.filter(([url]) =>
      (url as string).startsWith("/api/wallet"),
    ).length;

    await user.click(screen.getByRole("button", { name: /Buy rare sticker for 20/ }));

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(([url]) =>
        (url as string).startsWith("/api/wallet"),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

describe("missing only", () => {
  it("hides what is already collected", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Missing only" }));

    expect(slots()).toHaveLength(2);
    expect(slots().every((el) => el.getAttribute("data-owned") === "false")).toBe(true);
  });

  it("brings the whole album back", async () => {
    const user = await open();
    const toggle = screen.getByRole("button", { name: "Missing only" });

    await user.click(toggle);
    await user.click(toggle);

    expect(slots()).toHaveLength(4);
  });

  it("says so when nothing is missing", async () => {
    detail = body({ status: "completed", percent: 100 }, [
      slot({ slotIndex: 0, quantity: 1 }),
      slot({ slotIndex: 1, quantity: 2 }),
    ]);
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Missing only" }));

    expect(screen.getByText("Nothing missing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show the whole album/ }));
    expect(slots()).toHaveLength(2);
  });
});

describe("when the album is not there", () => {
  it("says so instead of rendering an empty grid", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      (url as string).startsWith("/api/albums/")
        ? json({ error: "album not found" }, 404)
        : json({ balance }),
    );
    render(<AlbumDetail />, { wrapper });

    expect(await screen.findByText("No such album")).toBeInTheDocument();
  });
});

describe("the random pull", () => {
  it("offers a roll at the album's random price", async () => {
    await open();
    expect(screen.getByRole("button", { name: /Random sticker · 40/ })).toBeEnabled();
  });

  it("posts once and reveals what came back", async () => {
    const user = await open();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") {
        return json(
          {
            balance: 960,
            spentCoins: 40,
            albumId: "alb1",
            stickerId: "stk1",
            tier: "rare",
            quantity: 1,
            duplicate: false,
            refundIfSold: 20,
          },
          201,
        );
      }
      if (url.startsWith("/api/albums/")) return json(detail);
      return json({ balance });
    });

    await user.click(screen.getByRole("button", { name: /Random sticker/ }));

    expect(await screen.findByText("New sticker")).toBeInTheDocument();

    // The art in the reveal is the art of the sticker that came back — stk1,
    // whose image is key(2). Any other slot's picture would be a lie about what
    // was just won.
    const revealed = document.querySelector("dialog[open] img") as HTMLImageElement;
    expect(revealed.getAttribute("src")).toBe(`/api/images/${key(2)}`);

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.[0]).toBe("/api/albums/alb1/pull");
  });

  it("offers a duplicate its way out", async () => {
    const user = await open();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET" && (url as string).endsWith("/pull")) {
        return json(
          {
            balance: 960,
            spentCoins: 40,
            albumId: "alb1",
            stickerId: "stk1",
            tier: "common",
            quantity: 2,
            duplicate: true,
            refundIfSold: 20,
          },
          201,
        );
      }
      if ((init?.method ?? "GET") !== "GET") return json({ balance: 980, refundedCoins: 20 }, 201);
      if (url.startsWith("/api/albums/")) return json(detail);
      return json({ balance });
    });

    await user.click(screen.getByRole("button", { name: /Random sticker/ }));
    await user.click(await screen.findByRole("button", { name: "Sell for 20" }));

    await waitFor(() => {
      const sale = fetchMock.mock.calls.find(([url]) => (url as string).includes("/api/stickers/"));
      expect(sale?.[0]).toBe("/api/stickers/stk1/sell");
    });
  });

  it("does not offer a roll inside a locked album", async () => {
    detail = body({ status: "locked", unlockedAt: null, owned: 0, percent: 0 });
    await open();
    expect(screen.queryByRole("button", { name: /Random sticker/ })).not.toBeInTheDocument();
  });

  it("stops offering a roll once the album is complete", async () => {
    detail = body({ status: "completed", percent: 100, owned: 2 }, [
      slot({ slotIndex: 0, quantity: 1 }),
      slot({ slotIndex: 1, quantity: 1 }),
    ]);
    await open();
    expect(screen.getByRole("button", { name: /Random sticker/ })).toBeDisabled();
  });

  it("stops offering a roll when everything left sits at zero odds", async () => {
    // Not a complete album — reachability is the rule, and this is the case
    // that tells the two apart. A roll here would buy a guaranteed duplicate.
    detail = body({ odds: { common: 100, rare: 0, epic: 0, legendary: 0 } }, [
      slot({ slotIndex: 0, tier: "common", quantity: 1 }),
      slot({ slotIndex: 1, tier: "legendary", quantity: 0 }),
    ]);
    await open();

    expect(screen.getByRole("button", { name: /Random sticker/ })).toBeDisabled();
    expect(screen.getByText(/direct purchase only/)).toBeInTheDocument();
  });

  it("does not offer a roll the balance cannot cover", async () => {
    balance = 10;
    await open();
    expect(screen.getByRole("button", { name: /Random sticker/ })).toBeDisabled();
  });
});

describe("selling a spare from the grid", () => {
  it("offers the sale on a slot that has a duplicate", async () => {
    const user = await open();
    // The legendary slot holds three copies; two of them are spares.
    await user.click(screen.getByRole("button", { name: /Sell a spare legendary for 20/ }));

    await waitFor(() => {
      const sale = fetchMock.mock.calls.find(([url]) => (url as string).includes("/api/stickers/"));
      expect(sale?.[0]).toBe("/api/stickers/stk2/sell");
    });
  });

  it("offers nothing on a single copy", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /Sell a spare common/ })).not.toBeInTheDocument();
  });
});

describe("deleting the album", () => {
  it("asks the user to type the title, and sends nothing until they do", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete this album" }));

    expect(screen.getByRole("button", { name: "Delete for good" })).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE"),
    ).toBe(false);
  });

  it("deletes and returns to the shelf", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete this album" }));
    await user.type(screen.getByLabelText(/type the album's title/i), "Kitchen heroes");
    await user.click(screen.getByRole("button", { name: "Delete for good" }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      );
      expect(del?.[0]).toBe("/api/albums/alb1");
    });

    // Staying on the page would leave the user looking at an album that no
    // longer exists — and a refresh would 404.
    expect(await screen.findByText("the shelf")).toBeInTheDocument();
  });

  it("sends nothing when the dialog is dismissed", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Delete this album" }));
    await user.type(screen.getByLabelText(/type the album's title/i), "Kitchen heroes");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE"),
    ).toBe(false);
  });
});

describe("the print export", () => {
  const panel = () => screen.queryByRole("region", { name: "Print export" });

  it("is offered on a completed album", async () => {
    // Completion unlocks the export — it is the reward for finishing.
    detail = body({ status: "completed", percent: 100, owned: 4 }, [
      slot({ slotIndex: 0, quantity: 1 }),
      slot({ slotIndex: 1, quantity: 1 }),
      slot({ slotIndex: 2, quantity: 1 }),
      slot({ slotIndex: 3, quantity: 2 }),
    ]);
    await open();

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  });

  it("is not offered while a slot is still empty", async () => {
    // An incomplete album would print a sheet with holes in it.
    await open(); // the default fixture is in progress, 2 of 4
    expect(panel()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export PDF" })).not.toBeInTheDocument();
  });

  it("is not offered on a locked album, however full it looks", async () => {
    detail = body({ status: "locked", unlockedAt: null, percent: 100, owned: 4 });
    await open();
    expect(panel()).not.toBeInTheDocument();
  });
});
