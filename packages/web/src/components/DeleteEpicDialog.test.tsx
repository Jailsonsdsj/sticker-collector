import type { Epic } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteEpicDialog } from "./DeleteEpicDialog";

/**
 * "The user must be asked whether to delete its tasks or simply leave them
 * unlinked" (prd/03-epics.md). One of these choices destroys work, so the tests
 * below care mostly about what CANNOT happen: no default, no way to confirm
 * without saying which.
 */

const epic: Epic = {
  id: "e1",
  title: "Sticker App",
  accent: "epic-1",
  coinGoalAlbumId: null,
  createdAt: "2026-07-01T00:00:00Z",
  oneOffTotal: 3,
  oneOffDone: 1,
};

function setup(props: Partial<Parameters<typeof DeleteEpicDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<DeleteEpicDialog epic={epic} onConfirm={onConfirm} onClose={onClose} {...props} />);
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe("the choice", () => {
  it("sends 'unlink' for Keep tasks", async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: /keep tasks/i }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("unlink");
  });

  it("sends 'cascade' for Delete tasks", async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: /delete tasks/i }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("cascade");
  });

  it("offers no way to confirm without choosing", () => {
    setup();
    const confirming = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((label) => !/cancel/i.test(label));

    // Exactly two paths forward, each naming what it does to the tasks.
    expect(confirming).toHaveLength(2);
    expect(confirming.some((l) => /^ok$|^confirm$|^delete$/i.test(l.trim()))).toBe(false);
  });

  it("cancels without confirming anything", async () => {
    const { onConfirm, onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("what it tells the user", () => {
  it("names the epic and how many tasks are at stake", () => {
    setup();
    expect(screen.getByText("Sticker App")).toBeInTheDocument();
    expect(screen.getByText(/3 tasks/)).toBeInTheDocument();
  });

  it("says the coins already earned are safe", () => {
    // Deleting is soft — occurrences and their ledger rows survive (T-06). If
    // the copy did not say so, "delete" would read as "and my coins go too".
    setup();
    expect(screen.getByText(/never taken back/i)).toBeInTheDocument();
  });

  it("is closed when there is no epic to delete", () => {
    setup({ epic: null });
    expect(screen.queryByRole("button", { name: /delete tasks/i })).not.toBeInTheDocument();
  });

  it("locks the choices while the request is in flight", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: /keep tasks/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete tasks/i })).toBeDisabled();
  });
});
