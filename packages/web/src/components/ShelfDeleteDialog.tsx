import { useDeleteAlbum, useDeletePuzzle } from "../lib/mutations";
import { DeleteAlbumDialog } from "./DeleteAlbumDialog";
import { DeletePuzzleDialog } from "./DeletePuzzleDialog";

/**
 * What the shelf is about to delete.
 *
 * `owned` is what the warning is actually about — stickers bought, pieces
 * unlocked — so it is carried here rather than fetched again.
 */
export interface ShelfDeleteTarget {
  kind: "album" | "puzzle";
  id: string;
  title: string;
  owned: number;
}

export interface ShelfDeleteDialogProps {
  target: ShelfDeleteTarget | null;
  onClose: () => void;
}

/**
 * The confirmation behind the shelf's ⋯ menu.
 *
 * Its own component because `Albums` is a long screen already, and because the
 * two dialogs and the two mutations are one concern that would otherwise be
 * four more things threaded through it.
 *
 * **No navigation afterwards**, unlike the detail screens this replaced: the
 * shelf is already where deleting from a card leaves you. The mutation
 * invalidates the lists and the tile disappears from under the menu.
 *
 * Both dialogs make the user type the title to confirm. That is what makes the
 * control safe to put on a tile at all — a shelf of twelve covers is twelve
 * chances to reach for the wrong one, and a menu plus a typed name is two
 * deliberate acts between a mis-tap and a deletion.
 */
export function ShelfDeleteDialog({ target, onClose }: ShelfDeleteDialogProps) {
  const removeAlbum = useDeleteAlbum();
  const removePuzzle = useDeletePuzzle();

  const album = target?.kind === "album" ? target : null;
  const puzzle = target?.kind === "puzzle" ? target : null;

  return (
    <>
      <DeleteAlbumDialog
        open={album !== null}
        title={album?.title ?? ""}
        owned={album?.owned ?? 0}
        pending={removeAlbum.isPending}
        onClose={onClose}
        onConfirm={async () => {
          if (!album) return;
          await removeAlbum.mutateAsync(album.id);
          onClose();
        }}
      />

      <DeletePuzzleDialog
        open={puzzle !== null}
        title={puzzle?.title ?? ""}
        owned={puzzle?.owned ?? 0}
        pending={removePuzzle.isPending}
        onClose={onClose}
        onConfirm={async () => {
          if (!puzzle) return;
          await removePuzzle.mutateAsync(puzzle.id);
          onClose();
        }}
      />
    </>
  );
}
