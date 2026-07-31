import { Button, Dialog } from "./ui";

/**
 * Leaving the album wizard with work in it.
 *
 * The draft used to survive every exit, on the theory that closing a tab
 * mid-wizard should cost nothing. It made *deliberate* exits behave wrongly:
 * back out of a new album, tap "New album" again, and last time's title, cover
 * and stickers were already sitting there — with no hint of where they came
 * from. A copied album was worse, since the fields looked like a fresh album's
 * defaults.
 *
 * So a deliberate exit now discards, and this is the confirmation that makes
 * that safe. The distinction that matters is deliberate versus accidental: a
 * refresh, a crash or a closed tab never reaches this dialog, and the stored
 * draft still restores exactly as before.
 */
export interface DiscardDraftDialogProps {
  open: boolean;
  /** Stay in the wizard, draft untouched. */
  onKeep: () => void;
  /** Throw the draft away and leave. */
  onDiscard: () => void;
}

export function DiscardDraftDialog({ open, onKeep, onDiscard }: DiscardDraftDialogProps) {
  return (
    <Dialog
      open={open}
      // Escape and the backdrop mean "I did not mean to leave" — the safe half
      // of the choice. Discarding is only ever the button.
      onClose={onKeep}
      tone="danger"
      title="Discard this album?"
      footer={
        <>
          <Button variant="ghost" tone="neutral" onClick={onKeep}>
            Keep editing
          </Button>
          <Button tone="magenta" onClick={onDiscard}>
            Discard
          </Button>
        </>
      }
    >
      <p>
        The album has not been sealed, so nothing has been created yet. Leaving now throws away the
        title, the cover and every sticker you have added.
      </p>
      <p className="mt-3">Images you cropped stay uploaded; they cost nothing and are reused.</p>
    </Dialog>
  );
}
