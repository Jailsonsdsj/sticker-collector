import { MAX_PIECES_PER_UNLOCK, pieceCount } from "@sticker-collector/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DeletePuzzleDialog } from "../components/DeletePuzzleDialog";
import { AppHeader } from "../components/layout";
import { PuzzleBoard } from "../components/PuzzleBoard";
import { Button, Coin, ErrorState, ProgressBar, Skeleton } from "../components/ui";
import { useDeletePuzzle, useUnlockPieces, useUnlockPuzzle } from "../lib/mutations";
import { usePuzzle, useWallet } from "../lib/queries";

/**
 * One puzzle, as a board.
 *
 * The picture fills the screen and everything else gets out of its way: the
 * bar at the bottom is pinned rather than scrolled to, because at 4× zoom the
 * thing you want after finding a piece is the button, and hunting for it means
 * losing the place you just found.
 *
 * **The price is on the bar, never on a piece.** A number printed 144 times is
 * noise, and it is the same number every time.
 */
export function PuzzleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const puzzle = usePuzzle(id);
  const remove = useDeletePuzzle();
  const [deleting, setDeleting] = useState(false);
  const wallet = useWallet();
  const unlock = useUnlockPuzzle();
  const buy = useUnlockPieces(id ?? "");
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);

  if (puzzle.isLoading) {
    return (
      <>
        <AppHeader title="Puzzle" />
        <Skeleton variant="block" />
      </>
    );
  }

  if (puzzle.isError || !puzzle.data) {
    return (
      <>
        <AppHeader title="Puzzle" />
        <ErrorState error={puzzle.error} onRetry={() => void puzzle.refetch()} />
      </>
    );
  }

  const board = puzzle.data;
  const grid = { rows: board.rows, cols: board.cols };
  const total = pieceCount(grid);
  const owned = new Set(board.ownedPieces);
  const done = board.completedAt !== null;
  const open = board.unlockedAt !== null;

  const cost = board.piecePrice * picked.size;
  const balance = wallet.data?.balance ?? 0;
  const affordable = cost <= balance;
  // Capped because the purchase is one batch — one payment and one insert per
  // piece — and that batch is the only all-or-nothing D1 offers.
  const full = picked.size >= MAX_PIECES_PER_UNLOCK;

  const toggle = (index: number) => {
    setFailure(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else if (next.size < MAX_PIECES_PER_UNLOCK) next.add(index);
      return next;
    });
  };

  async function purchase() {
    if (picked.size === 0 || buy.isPending) return;
    setFailure(null);
    try {
      await buy.mutateAsync({ pieces: [...picked] });
      setPicked(new Set());
    } catch {
      // The Worker grants the whole selection or none of it, so nothing is
      // half-bought and the selection is still worth keeping.
      setFailure("Could not buy those pieces. Try again.");
    }
  }

  return (
    <>
      <AppHeader
        title={board.title}
        trailing={
          // On the board, not on the card. Deleting is a decision made while
          // looking at the thing, and a delete on a shelf tile is a delete one
          // slip away from the wrong tile.
          <Button variant="ghost" tone="magenta" size="sm" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        }
      />

      <div className="flex flex-col gap-4 pb-24">
        {board.description && (
          <p className="whitespace-pre-line font-body text-sm text-ink-secondary">
            {board.description}
          </p>
        )}

        <PuzzleBoard
          imageKey={board.imageKey}
          grid={grid}
          owned={owned}
          hideLocked={board.hideLocked}
          selected={picked}
          onPick={open && !done ? toggle : undefined}
        />

        <div className="flex items-center gap-3">
          <ProgressBar
            className="flex-1"
            size="sm"
            tone={done ? "lime" : "violet"}
            value={(owned.size / total) * 100}
            aria-label={`${board.title} progress`}
          />
          <span className="font-numeric text-2xs font-bold text-ink-muted">
            {owned.size}/{total}
          </span>
        </div>

        {done && <p className="font-body text-sm text-lime">Finished — the picture is whole.</p>}
        {failure && (
          <p role="alert" className="font-body text-sm text-prio-high-fg">
            {failure}
          </p>
        )}
        {full && (
          <p role="status" className="font-body text-sm text-ink-dim">
            {MAX_PIECES_PER_UNLOCK} at a time. Buy these and pick some more.
          </p>
        )}
      </div>

      {/*
        Pinned above the tab bar, not inside the scrolling column. Finding a
        piece at 4× and then having to scroll away to reach the button loses
        the place you just found.
      */}
      {!done && (
        <div className="app-column fixed inset-x-0 bottom-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 border-border border-t bg-void/95 px-4 py-3">
          {open ? (
            <>
              <span className="flex items-center gap-1 font-body text-sm text-ink-secondary">
                {picked.size === 0 ? (
                  <>
                    <Coin size="xs" />
                    <span className="font-numeric font-bold text-coin">{board.piecePrice}</span>a
                    piece
                  </>
                ) : (
                  <>
                    {picked.size} for
                    <Coin size="xs" />
                    <span className="font-numeric font-bold text-coin">{cost}</span>
                  </>
                )}
              </span>
              <Button
                tone="lime"
                size="sm"
                disabled={picked.size === 0 || !affordable || buy.isPending}
                loading={buy.isPending}
                onClick={purchase}
              >
                {picked.size > 0 && !affordable ? "Not enough coins" : "Unlock"}
              </Button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1 font-body text-sm text-ink-secondary">
                Opens for
                <Coin size="xs" />
                <span className="font-numeric font-bold text-coin">{board.unlockPrice}</span>
              </span>
              <Button
                tone="violet"
                size="sm"
                disabled={board.unlockPrice > balance || unlock.isPending}
                loading={unlock.isPending}
                onClick={() => id && unlock.mutate(id)}
              >
                {board.unlockPrice > balance ? "Not enough coins" : "Unlock puzzle"}
              </Button>
            </>
          )}
        </div>
      )}
      <DeletePuzzleDialog
        open={deleting}
        title={board.title}
        owned={owned.size}
        pending={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!id) return;
          await remove.mutateAsync(id);
          // Back to the shelf: the thing this screen is about no longer exists.
          void navigate("/albums");
        }}
      />
    </>
  );
}
