import type { AlbumSummary } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AlbumCard } from "./AlbumCard";

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
    affordable: false,
    ...over,
  };
}

function renderCard(over: Partial<AlbumSummary> = {}, onUnlock = vi.fn()) {
  render(
    <MemoryRouter>
      <AlbumCard album={album(over)} onUnlock={onUnlock} />
    </MemoryRouter>,
  );
  return { onUnlock };
}

const cover = () => document.querySelector("img") as HTMLImageElement;

describe("one image, two appearances", () => {
  it("renders the same source whether locked or unlocked", () => {
    // The claim the whole task rests on: grayscale is a filter over one colour
    // master. A second asset would show up here as a different src.
    renderCard({ status: "locked" });
    const lockedSrc = cover().getAttribute("src");

    render(
      <MemoryRouter>
        <AlbumCard
          album={album({ status: "in_progress", unlockedAt: "2026-07-02T00:00:00Z" })}
          onUnlock={vi.fn()}
        />
      </MemoryRouter>,
    );
    const sources = [...document.querySelectorAll("img")].map((img) => img.getAttribute("src"));

    expect(lockedSrc).toBe(`/api/images/${COVER}`);
    expect(new Set(sources).size).toBe(1); // both cards, one asset
  });

  it("greys a locked cover with a filter, not a different file", () => {
    renderCard({ status: "locked" });
    expect(cover().style.filter).toBe("var(--filter-locked)");
  });

  it("shows an unlocked cover in colour", () => {
    renderCard({ status: "in_progress", unlockedAt: "2026-07-02T00:00:00Z" });
    expect(cover().style.filter).toBe("var(--filter-unlocked)");
  });
});

describe("the control beneath the cover", () => {
  it("offers the unlock price while locked, and no progress bar", () => {
    renderCard({ status: "locked", unlockPrice: 200 });

    expect(screen.getByRole("button", { name: "Unlock 200" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows progress once unlocked, and no unlock button", () => {
    renderCard({
      status: "in_progress",
      unlockedAt: "2026-07-02T00:00:00Z",
      owned: 6,
      total: 12,
      percent: 50,
      remaining: 6,
    });

    // The bar draws its label twice by design (visible + clipped), so the role
    // and its value are what to assert on.
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAccessibleName("Kitchen heroes: 6 of 12 collected");
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
  });

  it("asks to unlock rather than unlocking on the spot", async () => {
    // Spending is irreversible, so the card only opens the confirmation.
    const { onUnlock } = renderCard({ status: "locked" });
    await userEvent.click(screen.getByRole("button", { name: "Unlock 200" }));
    expect(onUnlock).toHaveBeenCalledOnce();
  });
});

describe("the two nudges", () => {
  it("points at the last slots", () => {
    renderCard({ status: "in_progress", unlockedAt: "x", almostThere: true, remaining: 1 });
    expect(screen.getByText("1 to go")).toBeInTheDocument();
  });

  it("says how many when two are left", () => {
    renderCard({ status: "in_progress", unlockedAt: "x", almostThere: true, remaining: 2 });
    expect(screen.getByText("2 to go")).toBeInTheDocument();
  });

  it("stays quiet when the album is not close", () => {
    renderCard({ status: "in_progress", unlockedAt: "x", almostThere: false, remaining: 7 });
    expect(screen.queryByText(/to go/)).not.toBeInTheDocument();
  });

  it("marks a completed album instead of nagging", () => {
    renderCard({
      status: "completed",
      unlockedAt: "x",
      completedAt: "y",
      owned: 12,
      total: 12,
      percent: 100,
      remaining: 0,
    });
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).not.toBeInTheDocument();
  });

  it("marks an album the balance could open", () => {
    renderCard({ status: "locked", affordable: true });
    const button = screen.getByRole("button", { name: "Unlock 200" });
    expect(button.className).toContain("shadow-coin");
  });

  it("leaves an unaffordable album unmarked but still openable", () => {
    // The cue is a hint, not a barrier: the dialog explains the shortfall.
    renderCard({ status: "locked", affordable: false });
    const button = screen.getByRole("button", { name: "Unlock 200" });
    expect(button.className).not.toContain("shadow-coin");
    expect(button).toBeEnabled();
  });
});

describe("opening an album", () => {
  it("links to its own page, locked or not", () => {
    // Browsing a locked album is permitted; buying inside one is not.
    renderCard({ status: "locked" });
    expect(screen.getByRole("link", { name: /Kitchen heroes/ })).toHaveAttribute(
      "href",
      "/albums/alb1",
    );
  });
});

describe("the title", () => {
  it("is centred under the cover", () => {
    renderCard();
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("text-center");
  });
});

describe("saying what it is", () => {
  it("wears its kind, the way a puzzle card does", () => {
    // The shelf holds two kinds of thing. A card that names one and not the
    // other reads as the unnamed one being the default, which is not how the
    // shelf works — and there is now a filter that asks you to tell them apart.
    renderCard();
    expect(screen.getByText("Album")).toBeInTheDocument();
  });

  it("wears it whatever state it is in", () => {
    renderCard({ status: "completed", unlockedAt: "x", percent: 100 });
    expect(screen.getByText("Album")).toBeInTheDocument();
  });

  it("keeps the status badge out of the kind badge's corner", () => {
    // Both used to sit top-left. Overlapping badges is the failure this
    // prevents, and it is invisible to a text query.
    const { container } = render(
      <MemoryRouter>
        <AlbumCard album={album({ status: "completed", unlockedAt: "x" })} onUnlock={vi.fn()} />
      </MemoryRouter>,
    );

    const kind = screen.getByText("Album").closest("span[class*='absolute']");
    const status = screen.getByText("Complete").closest("span[class*='absolute']");
    expect(kind?.className).toContain("left-2");
    expect(status?.className).toContain("right-2");
    expect(container.querySelectorAll("span.absolute.top-2.left-2")).toHaveLength(1);
  });

  it("moves the almost-there nudge to the same free corner", () => {
    render(
      <MemoryRouter>
        <AlbumCard
          album={album({ status: "in_progress", unlockedAt: "x", almostThere: true, remaining: 1 })}
          onUnlock={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("1 to go").closest("span[class*='absolute']")?.className).toContain(
      "right-2",
    );
  });
});
