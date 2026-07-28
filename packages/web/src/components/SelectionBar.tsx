import { Button } from "./ui";

/**
 * The header while a multi-selection is in progress. It replaces the normal
 * controls rather than sitting beside them, so it is never ambiguous whether a
 * tap selects or completes.
 */
export interface SelectionBarProps {
  count: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onCancel: () => void;
  pending?: boolean;
}

export function SelectionBar({
  count,
  onDuplicate,
  onDelete,
  onCancel,
  pending,
}: SelectionBarProps) {
  // The API rejects an empty list, so both actions stay closed until something
  // is picked.
  const nothingPicked = count === 0;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-panel p-3">
      <span aria-live="polite" className="flex-1 font-numeric text-sm font-bold text-ink">
        {count} selected
      </span>

      <Button
        variant="outline"
        tone="cyan"
        size="sm"
        disabled={nothingPicked || pending}
        onClick={onDuplicate}
      >
        Duplicate
      </Button>
      <Button
        variant="outline"
        tone="magenta"
        size="sm"
        disabled={nothingPicked || pending}
        onClick={onDelete}
      >
        Delete
      </Button>
      <Button variant="ghost" tone="neutral" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
