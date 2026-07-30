import { useState } from "react";
import { Button } from "../ui";

/**
 * Delete, with the confirmation inline rather than in a second dialog.
 *
 * The form is already a `<dialog>`; nesting another would put two modals in the
 * top layer at once for a one-line question. Swapping the button for the
 * question asks it just as clearly and keeps the sheet the only thing open.
 *
 * The copy matters: the app's delete is soft, so the coins the task already
 * earned survive (T-03). Without saying so, "delete" reads as "and my coins
 * go too".
 */
export function DeleteTaskAction({
  onDelete,
  disabled,
}: {
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mt-2 border-t border-border pt-4">
      {confirming ? (
        <div className="flex items-center gap-3">
          <span className="flex-1 font-body text-md text-ink-secondary">
            Delete this task? Coins it already earned are kept.
          </span>
          <Button variant="ghost" tone="neutral" size="sm" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button tone="magenta" size="sm" disabled={disabled} onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <Button variant="outline" tone="magenta" size="sm" onClick={() => setConfirming(true)}>
          🗑 Delete task
        </Button>
      )}
    </div>
  );
}
