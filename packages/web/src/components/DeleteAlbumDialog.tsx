import { useEffect, useState } from "react";
import { Button, Dialog, Input } from "./ui";

export interface DeleteAlbumDialogProps {
  open: boolean;
  title: string;
  /** How many stickers were bought inside it — what the warning is really about. */
  owned: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Deleting an album, behind a wall the user has to type their way through.
 *
 * This is the most destructive action in the app: the album, every sticker
 * bought inside it, every coin spent on it and the right to export it all go,
 * and **nothing is refunded** (`prd/04-albums.md` §Deleting 1). A dialog with a
 * red button would be dismissed by muscle memory; typing the title cannot be.
 *
 * The match is trimmed and case-insensitive (§Deleting 2) — the point is to
 * prove intent, not to test typing accuracy.
 */
export function DeleteAlbumDialog({
  open,
  title,
  owned,
  pending,
  onConfirm,
  onClose,
}: DeleteAlbumDialogProps) {
  const [typed, setTyped] = useState("");

  // A fresh dialog starts empty, or a second delete would open pre-confirmed.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const matches = typed.trim().toLowerCase() === title.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      tone="danger"
      title="Delete this album?"
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
          {owned === 1 ? "sticker" : "stickers"} collected inside it, and the right to print it.{" "}
          <span className="font-bold text-ink">No coins are refunded.</span> This cannot be undone.
        </p>

        <Input
          id="delete-album-confirm"
          label={`Type the album's title to confirm`}
          hint={title}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
    </Dialog>
  );
}
