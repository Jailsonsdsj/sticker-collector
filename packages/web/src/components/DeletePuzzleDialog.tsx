import { useEffect, useState } from "react";
import { Button, Dialog, Input } from "./ui";

export interface DeletePuzzleDialogProps {
  open: boolean;
  title: string;
  /** How many pieces were bought — what the warning is really about. */
  owned: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Deleting a puzzle, behind the same wall an album has.
 *
 * Its own component rather than a `kind` prop on the album's, matching how
 * epics and tasks each have theirs: the mechanism is shared and the copy is
 * not, and a dialog that tells you what you are about to lose should say it in
 * the words of the thing you are losing.
 *
 * The stakes are the same. Every piece bought, every coin spent on them, gone —
 * and **nothing is refunded**, because the ledger is append-only and a refund
 * would be a second transaction nobody asked for. A red button would be
 * dismissed by muscle memory; typing the title cannot be.
 */
export function DeletePuzzleDialog({
  open,
  title,
  owned,
  pending,
  onConfirm,
  onClose,
}: DeletePuzzleDialogProps) {
  const [typed, setTyped] = useState("");

  // A fresh dialog starts empty, or a second delete would open pre-confirmed.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  // Trimmed and case-insensitive: the point is to prove intent, not to test
  // typing accuracy.
  const matches = typed.trim().toLowerCase() === title.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      tone="danger"
      title="Delete this puzzle?"
      footer={
        <>
          <Button variant="ghost" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            tone="magenta"
            disabled={!matches || pending}
            loading={pending}
            onClick={onConfirm}
          >
            Delete for good
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-body text-sm text-ink-secondary">
          You will lose <span className="font-bold text-ink">{title}</span>, the{" "}
          <span className="font-numeric font-bold text-ink">{owned}</span>{" "}
          {owned === 1 ? "piece" : "pieces"} you have bought, and the picture they were making.{" "}
          <span className="font-bold text-ink">No coins are refunded.</span> This cannot be undone.
        </p>

        <Input
          id="delete-puzzle-confirm"
          label="Type the puzzle's title to confirm"
          hint={title}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
    </Dialog>
  );
}
