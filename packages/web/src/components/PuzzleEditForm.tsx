import type { Puzzle, UpdatePuzzleInput } from "@sticker-collector/shared";
import { useState } from "react";
import { Button, Input, Sheet, Textarea } from "./ui";

export interface PuzzleEditFormProps {
  /** The puzzle being edited, or null when the form is closed. */
  puzzle: Puzzle | null;
  pending?: boolean;
  onSave: (patch: UpdatePuzzleInput) => void;
  onClose: () => void;
}

/**
 * A number field's value, which is a string until it is not.
 *
 * Kept as typed rather than parsed on every keystroke: parsing eagerly means
 * clearing the box to retype it becomes `0`, and the zero is then in the patch.
 * An empty box means "leave it alone", which is what `undefined` says on the
 * wire.
 */
const num = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

/**
 * Editing a puzzle after it exists.
 *
 * **The words and the prices, and nothing else.** There is no picture and no
 * piece count here, and that is not an omission: every piece already bought is
 * an index into that grid, so re-cutting a board would move the pieces someone
 * paid for. The `puzzle_frozen` trigger refuses both, and a form offering what
 * the database will reject is a form that lies.
 *
 * The prices *are* editable, which they were not before migration 0018. The
 * cost is worth knowing: what a puzzle reports having cost is derived from its
 * current prices rather than from the ledger, so re-pricing one that is part
 * built changes what its info dialog says was spent. The coins actually charged
 * are in the ledger and are not affected.
 *
 * A `Sheet` rather than a route: the shelf is where the decision was made, and
 * a screen change to rename something loses the place you were looking at.
 */
export function PuzzleEditForm({ puzzle, pending = false, onSave, onClose }: PuzzleEditFormProps) {
  if (!puzzle) return null;
  return (
    <Fields key={puzzle.id} puzzle={puzzle} pending={pending} onSave={onSave} onClose={onClose} />
  );
}

/**
 * The fields, seeded once from the puzzle.
 *
 * Its own component, keyed by id, because the state starts as a copy: mounted
 * once per puzzle, opening a second one cannot show the first one's answers,
 * and a refetch landing mid-edit cannot overwrite what is being typed.
 */
function Fields({
  puzzle,
  pending,
  onSave,
  onClose,
}: PuzzleEditFormProps & { puzzle: Puzzle; pending: boolean }) {
  const [title, setTitle] = useState(puzzle.title);
  const [description, setDescription] = useState(puzzle.description ?? "");
  const [unlockPrice, setUnlockPrice] = useState(String(puzzle.unlockPrice));
  const [piecePrice, setPiecePrice] = useState(String(puzzle.piecePrice));
  const [randomPrice, setRandomPrice] = useState(String(puzzle.randomPrice));

  const trimmed = title.trim();

  const save = () => {
    const next = description.trim();
    onSave({
      title: trimmed,
      // Null clears it; the API tells null and absent apart.
      description: next === "" ? null : next,
      unlockPrice: num(unlockPrice),
      piecePrice: num(piecePrice),
      randomPrice: num(randomPrice),
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit puzzle"
      trailing={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          id="puzzle-edit-title"
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          id="puzzle-edit-description"
          label="Description"
          rows={3}
          placeholder="Where it is from, why it matters…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex gap-3">
          <Input
            id="puzzle-edit-unlock-price"
            type="number"
            tone="numeric"
            label="Unlock price"
            hint="to open it"
            className="flex-1"
            value={unlockPrice}
            onChange={(e) => setUnlockPrice(e.target.value)}
          />
          <Input
            id="puzzle-edit-piece-price"
            type="number"
            tone="numeric"
            label="Piece price"
            hint="each"
            className="flex-1"
            value={piecePrice}
            onChange={(e) => setPiecePrice(e.target.value)}
          />
        </div>

        <Input
          id="puzzle-edit-random-price"
          type="number"
          tone="numeric"
          label="Random piece"
          hint="0 withdraws the gamble"
          value={randomPrice}
          onChange={(e) => setRandomPrice(e.target.value)}
        />

        {/* Said here rather than discovered later. A part-built puzzle reports
            what it has cost from its prices, not from the ledger. */}
        {puzzle.ownedCount > 0 && (
          <p className="font-body text-sm text-ink-secondary">
            This puzzle is part built. Changing a price also changes the time it reports having cost
            so far — the coins you actually spent are unchanged.
          </p>
        )}

        <Button block tone="cyan" loading={pending} disabled={trimmed === ""} onClick={save}>
          Save changes
        </Button>
      </div>
    </Sheet>
  );
}
