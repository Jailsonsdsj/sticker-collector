import type { DeleteEpic, Epic } from "@sticker-collector/shared";
import { Button, Dialog } from "./ui";

/**
 * "When deleting an epic, the user must be asked whether to delete its tasks or
 * simply leave them unlinked" (prd/03-epics.md).
 *
 * Two explicit buttons, **no default** — the API refuses a missing mode for the
 * same reason. One of these destroys work, and a default would eventually pick
 * it for someone who only meant to tidy up a label.
 *
 * "Delete" here is the app's soft delete: the tasks stop generating, but their
 * occurrences and the coins they paid survive (T-06). The copy says so, because
 * "delete" otherwise reads as "and my coins go with it".
 */
export interface DeleteEpicDialogProps {
  epic: Epic | null;
  onClose: () => void;
  onConfirm: (mode: DeleteEpic["mode"]) => void;
  pending?: boolean;
}

export function DeleteEpicDialog({ epic, onClose, onConfirm, pending }: DeleteEpicDialogProps) {
  return (
    <Dialog
      open={epic !== null}
      onClose={onClose}
      tone="danger"
      title="Delete epic?"
      footer={
        <>
          <Button variant="ghost" tone="neutral" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            tone="cyan"
            disabled={pending}
            onClick={() => onConfirm("unlink")}
          >
            Keep tasks
          </Button>
          <Button tone="magenta" disabled={pending} onClick={() => onConfirm("cascade")}>
            Delete tasks
          </Button>
        </>
      }
    >
      <p>
        <strong className="text-ink">{epic?.title}</strong> will be removed. Choose what happens to
        the {epic?.oneOffTotal ?? 0} task{epic?.oneOffTotal === 1 ? "" : "s"} inside it.
      </p>
      <p className="mt-3">
        <strong className="text-cyan">Keep tasks</strong> leaves them in place, no longer grouped.{" "}
        <strong className="text-magenta">Delete tasks</strong> removes them too — coins already
        earned are never taken back.
      </p>
    </Dialog>
  );
}
