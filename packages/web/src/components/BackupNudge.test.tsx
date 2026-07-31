import type { AlbumSummary } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { recordExport } from "../lib/backupState";
import { BackupNudge } from "./BackupNudge";

const JAN = "2026-01-10T09:00:00.000Z";
const FEB = "2026-02-10T09:00:00.000Z";
const MAR = "2026-03-10T09:00:00.000Z";

function album(createdAt: string, completedAt: string | null = null): AlbumSummary {
  return {
    id: `alb-${createdAt}`,
    title: "Kitchen heroes",
    description: null,
    coverKey: `img/${"a".repeat(64)}.jpg`,
    derivedFromAlbumId: null,
    unlockPrice: 200,
    randomPrice: 40,
    prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
    odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
    hideLocked: false,
    lockedCoverKey: null,
    unlockedAt: null,
    completedAt,
    sealedAt: createdAt,
    createdAt,
    editionNumber: 1,
    owned: 0,
    total: 12,
    percent: 0,
    status: "locked",
    remaining: 12,
    almostThere: false,
    affordable: false,
  };
}

const show = (albums: AlbumSummary[]) =>
  render(
    <MemoryRouter>
      <BackupNudge albums={albums} />
    </MemoryRouter>,
  );

const nudge = () => screen.queryByRole("complementary", { name: "Back up your collection" });

beforeEach(() => localStorage.clear());

describe("when it asks", () => {
  it("asks after an album is created", () => {
    recordExport(JAN);
    show([album(FEB)]);
    expect(nudge()).toBeInTheDocument();
  });

  it("asks after an album is finished", () => {
    recordExport(FEB);
    show([album(JAN, MAR)]);
    expect(nudge()).toBeInTheDocument();
  });

  it("asks someone who has never backed up", () => {
    show([album(JAN)]);
    expect(nudge()).toBeInTheDocument();
  });
});

describe("when it stays quiet", () => {
  it("says nothing once a backup is newer than the change", () => {
    recordExport(MAR);
    show([album(JAN, FEB)]);
    expect(nudge()).not.toBeInTheDocument();
  });

  it("says nothing to someone with no albums to lose", () => {
    show([]);
    expect(nudge()).not.toBeInTheDocument();
  });
});

describe("acting on it", () => {
  it("points at the backup, rather than doing it here", () => {
    show([album(JAN)]);
    expect(screen.getByRole("link", { name: "Back up" })).toHaveAttribute("href", "/settings");
  });

  it("can be put off", async () => {
    show([album(JAN)]);
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(nudge()).not.toBeInTheDocument();
  });

  it("stays away on the next visit, for that same change", async () => {
    const first = show([album(JAN)]);
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    first.unmount();

    show([album(JAN)]);
    expect(nudge()).not.toBeInTheDocument();
  });

  it("comes back when a new album appears", async () => {
    // A nudge you can silence forever is not insurance.
    const first = show([album(JAN)]);
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    first.unmount();

    show([album(JAN), album(MAR)]);
    expect(nudge()).toBeInTheDocument();
  });

  it("never blocks the shelf", () => {
    // A suggestion, not a modal.
    show([album(JAN)]);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });
});
