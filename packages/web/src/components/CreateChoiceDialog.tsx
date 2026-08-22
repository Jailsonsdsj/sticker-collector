import { useNavigate } from "react-router";
import { Button, Dialog } from "./ui";

export interface CreateChoiceDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Album or puzzle — the fork the Create button became.
 *
 * A dialog rather than two buttons in the header. The two are not equally
 * frequent and they are not the same size of undertaking, so a row of two
 * would make them look interchangeable; asking once, with a sentence each,
 * says what the choice actually is. It also keeps the header to one control on
 * a screen that already has tabs and a filter.
 *
 * Both routes are one-way: an album and a puzzle are each sealed on creation.
 */
export function CreateChoiceDialog({ open, onClose }: CreateChoiceDialogProps) {
  const navigate = useNavigate();

  const go = (to: string) => {
    onClose();
    void navigate(to);
  };

  return (
    <Dialog open={open} onClose={onClose} title="What are you making?">
      <div className="flex flex-col gap-3">
        <Choice
          label="Album"
          tone="cyan"
          description="A set of stickers, bought one at a time or pulled at random. Finishing one unlocks a print-ready PDF."
          onClick={() => go("/albums/new")}
        />
        <Choice
          label="Jigsaw puzzle"
          tone="violet"
          description="One picture, cut into a grid. Buy the pieces back until it is whole."
          onClick={() => go("/puzzles/new")}
        />
      </div>
    </Dialog>
  );
}

function Choice({
  label,
  description,
  tone,
  onClick,
}: {
  label: string;
  description: string;
  tone: "cyan" | "violet";
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-1 p-4">
      <p className="font-body text-md font-semibold text-ink">{label}</p>
      <p className="font-body text-sm text-ink-secondary">{description}</p>
      <Button tone={tone} size="sm" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
