import type { AlbumDetail, OwnedSticker } from "@sticker-collector/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPanel } from "./ExportPanel";

/**
 * The panel. `exportAlbum` is stubbed here — it has its own tests, and what
 * matters at this level is what the user is offered and what they are told.
 */

const exported = vi.fn();
vi.mock("../lib/exportAlbum", () => ({
  exportAlbum: (options: Record<string, unknown>) => exported(options),
}));

function album(count = 9): AlbumDetail {
  const stickers: OwnedSticker[] = Array.from({ length: count }, (_, i) => ({
    id: `stk${i}`,
    albumId: "alb1",
    imageKey: `img/${(i + 1).toString(16).padStart(64, "0")}.jpg`,
    tier: "common",
    slotIndex: i,
    quantity: 1,
  }));
  return {
    album: {
      id: "alb1",
      title: "Kitchen heroes",
      description: null,
      coverKey: `img/${"f".repeat(64)}.jpg`,
      derivedFromAlbumId: null,
      unlockPrice: 200,
      randomPrice: 40,
      prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
      odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
      unlockedAt: "2026-07-02T00:00:00Z",
      completedAt: "2026-07-20T00:00:00Z",
      sealedAt: "2026-07-01T00:00:00Z",
      createdAt: "2026-07-01T00:00:00Z",
      editionNumber: 1,
      owned: count,
      total: count,
      percent: 100,
      status: "completed",
      remaining: 0,
      almostThere: false,
      affordable: false,
    },
    stickers,
  };
}

beforeEach(() => {
  exported.mockReset().mockResolvedValue("sticker-collector-kitchen-heroes-2026-07-29.pdf");
});

afterEach(() => vi.unstubAllGlobals());

describe("exporting", () => {
  it("builds the PDF when asked", async () => {
    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => expect(exported).toHaveBeenCalledOnce());
    expect(exported.mock.calls[0]?.[0]).toMatchObject({ paper: "a4" });
  });

  it("can be run again straight away", async () => {
    // Completion unlocks the export for as long as the album exists.
    render(<ExportPanel album={album()} />);
    const button = screen.getByRole("button", { name: "Export PDF" });

    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText(/^Saved /)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => expect(exported).toHaveBeenCalledTimes(2));
  });

  it("says where the file went", async () => {
    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(
      await screen.findByText("Saved sticker-collector-kitchen-heroes-2026-07-29.pdf"),
    ).toBeInTheDocument();
  });

  it("passes today's date, in the user's own calendar", async () => {
    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => {
      const options = exported.mock.calls[0]?.[0] as { today: string };
      expect(options.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe("paper", () => {
  it("defaults to A4", async () => {
    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => expect(exported.mock.calls[0]?.[0]).toMatchObject({ paper: "a4" }));
  });

  it("offers US Letter", async () => {
    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "US Letter" }));
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => expect(exported.mock.calls[0]?.[0]).toMatchObject({ paper: "letter" }));
  });
});

describe("while it works", () => {
  /**
   * An export that finishes only when the test says so.
   *
   * A timer-based mock makes these assertions a race — the progress line is
   * cleared the moment the export resolves, so under load it can vanish before
   * the assertion looks for it. This holds the export open instead.
   */
  function deferred() {
    let release!: (filename: string) => void;
    const promise = new Promise<string>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  it("counts the images as they arrive", async () => {
    const pending = deferred();
    exported.mockImplementation((options: { onProgress?: (d: number, t: number) => void }) => {
      options.onProgress?.(3, 10);
      return pending.promise;
    });

    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    // Synchronous: the progress state is set inside the click's own flush, so
    // waiting would only make this depend on retry timers another test file can
    // leave faked.
    expect(screen.getByText("3 of 10 images")).toBeInTheDocument();

    pending.release("file.pdf");
  });

  it("cannot be started twice at once", async () => {
    const pending = deferred();
    exported.mockImplementation(() => pending.promise);

    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(screen.getByRole("button", { name: "Building…" })).toBeDisabled();

    pending.release("file.pdf");
  });
});

describe("when it fails", () => {
  it("says so, and offers another try", async () => {
    exported.mockRejectedValue(new Error("An image could not be loaded"));

    render(<ExportPanel album={album()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("An image could not be loaded");
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
    expect(screen.queryByText(/^Saved /)).not.toBeInTheDocument();
  });
});
