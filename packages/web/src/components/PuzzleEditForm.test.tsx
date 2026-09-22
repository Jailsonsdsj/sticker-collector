import type { Puzzle, UpdatePuzzleInput } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PuzzleEditForm } from "./PuzzleEditForm";

const puzzle = (over: Partial<Puzzle> = {}): Puzzle => ({
  id: "p1",
  title: "The harbour",
  description: "Taken at dawn",
  imageKey: `img/${"b".repeat(64)}.jpg`,
  imageWidth: 1536,
  imageHeight: 1024,
  unlockPrice: 1000,
  piecePrice: 150,
  randomPrice: 100,
  rows: 12,
  cols: 12,
  hideLocked: false,
  unlockedAt: null,
  completedAt: null,
  sealedAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  ownedCount: 0,
  ...over,
});

const open = (over: Partial<Puzzle> = {}) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<PuzzleEditForm puzzle={puzzle(over)} onSave={onSave} onClose={onClose} />);
  return { user, onSave, onClose };
};

const saved = (onSave: ReturnType<typeof vi.fn>): UpdatePuzzleInput => onSave.mock.calls[0]?.[0];

describe("what it opens with", () => {
  it("shows the puzzle as it stands, so a change is an edit and not a re-entry", () => {
    open();

    expect(screen.getByLabelText(/^Title/)).toHaveValue("The harbour");
    expect(screen.getByLabelText(/^Description/)).toHaveValue("Taken at dawn");
    expect(screen.getByLabelText(/^Unlock price/)).toHaveValue(1000);
    expect(screen.getByLabelText(/^Piece price/)).toHaveValue(150);
    expect(screen.getByLabelText(/^Random piece/)).toHaveValue(100);
  });

  it("offers nothing that the grid or the picture would change", () => {
    // Not an omission. Every owned piece is an index into that grid, and
    // `puzzle_frozen` refuses to move it — a form offering what the database
    // rejects is a form that lies.
    open();

    expect(screen.queryByLabelText(/picture/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pieces/i)).not.toBeInTheDocument();
  });

  it("renders nothing at all when no puzzle is being edited", () => {
    const { container } = render(
      <PuzzleEditForm puzzle={null} onSave={vi.fn()} onClose={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("saving", () => {
  it("sends the fields as they now read", async () => {
    const { user, onSave } = open();

    await user.clear(screen.getByLabelText(/^Title/));
    await user.type(screen.getByLabelText(/^Title/), "The north pier");
    await user.clear(screen.getByLabelText(/^Piece price/));
    await user.type(screen.getByLabelText(/^Piece price/), "20");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave)).toMatchObject({ title: "The north pier", piecePrice: 20 });
  });

  it("sends the three prices together, since one form saves them all", async () => {
    const { user, onSave } = open();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave)).toMatchObject({ unlockPrice: 1000, piecePrice: 150, randomPrice: 100 });
  });

  it("clears the description with null rather than an empty string", async () => {
    // The API tells null and absent apart: null clears, absent leaves alone.
    const { user, onSave } = open();

    await user.clear(screen.getByLabelText(/^Description/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave).description).toBeNull();
  });

  it("leaves a price alone when its box is emptied", async () => {
    // Clearing a number box to retype it must not be read as "zero". Empty
    // means "no opinion", which is `undefined` on the wire.
    const { user, onSave } = open();

    await user.clear(screen.getByLabelText(/^Unlock price/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave).unlockPrice).toBeUndefined();
    expect(saved(onSave).piecePrice).toBe(150);
  });

  it("takes 0 for the random price, which withdraws the gamble", async () => {
    // Distinct from empty: 0 is a decision, not an absence.
    const { user, onSave } = open();

    await user.clear(screen.getByLabelText(/^Random piece/));
    await user.type(screen.getByLabelText(/^Random piece/), "0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave).randomPrice).toBe(0);
  });

  it("trims the title, so a stray space is not a rename", async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Title/), "   ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saved(onSave).title).toBe("The harbour");
  });

  it("will not save an empty title", async () => {
    // The API refuses it with a 400; refusing here says so before the trip.
    const { user, onSave } = open();

    await user.clear(screen.getByLabelText(/^Title/));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes without saving on Cancel", async () => {
    const { user, onSave, onClose } = open();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("a puzzle that is part built", () => {
  it("says a re-price changes what it reports having cost", () => {
    // What a puzzle has cost is derived from its current prices, not from the
    // ledger. Better said here than discovered in the info dialog afterwards.
    open({ ownedCount: 4 });

    expect(screen.getByText(/reports having cost/i)).toBeInTheDocument();
  });

  it("stays quiet when nothing has been bought yet", () => {
    open({ ownedCount: 0 });

    expect(screen.queryByText(/reports having cost/i)).not.toBeInTheDocument();
  });
});
