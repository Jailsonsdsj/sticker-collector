import { MAX_PIECES_PER_UNLOCK, pieceCount } from "@sticker-collector/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DeletePuzzleDialog } from "../components/DeletePuzzleDialog";
import { AppHeader } from "../components/layout";
import { PuzzleBoard } from "../components/PuzzleBoard";
import { Button, Coin, ErrorState, ProgressBar, Skeleton } from "../components/ui";
import { useDeletePuzzle, usePullPiece, useUnlockPieces, useUnlockPuzzle } from "../lib/mutations";
import { playPieceLanding } from "../lib/placement";
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
  const pull = usePullPiece(id ?? "");
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  // Bumped to put the picture back where it opened. A counter rather than a
  // boolean: pressing reset twice in a row has to work the second time.
  const [resetToken, setResetToken] = useState(0);
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

  async function gamble() {
    if (pull.isPending) return;
    setFailure(null);
    try {
      const result = await pull.mutateAsync();
      const [landed] = result.pieces;
      // On the next frame, not this one: the tile only becomes an owned piece
      // once the refetched board has rendered, and animating the locked one
      // would drop a grey square into place and then swap it for the picture.
      if (landed !== undefined) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => playPieceLanding(landed));
        });
      }
    } catch {
      setFailure("Could not pull a piece. Try again.");
    }
  }

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

      {/*
        Full bleed, and as tall as the screen allows.
        
        The board used to be a square in the middle of a mostly-empty page: on a
        phone the picture had a third of the screen and the rest was nothing —
        which is the opposite of a thing you navigate around. `-mx-4` escapes
        the app column's padding; the flex column below gives whatever is left
        after the description to the board itself.
      */}
      {/* The height is a class, not an inline style. jsdom throws resolving
          `env()` inside a `calc()` it is asked to compute, and every role-based
          query in the subtree goes down with it — a Tailwind arbitrary value
          lives in a stylesheet the tests never parse. */}
      <div className="-mx-4 flex h-[calc(100dvh_-_var(--size-tabbar)_-_env(safe-area-inset-bottom)_-_9rem)] flex-col">
        {board.description && (
          <p className="shrink-0 whitespace-pre-line px-4 pb-2 font-body text-sm text-ink-secondary">
            {board.description}
          </p>
        )}

        <div className="relative min-h-0 flex-1">
          <PuzzleBoard
            imageKey={board.imageKey}
            image={{ width: board.imageWidth, height: board.imageHeight }}
            grid={grid}
            owned={owned}
            hideLocked={board.hideLocked}
            selected={picked}
            onPick={open && !done ? toggle : undefined}
            resetToken={resetToken}
          />

          {/* On the board and floating, because it is about the board and
              nothing else — and a reader zoomed into a corner should not have
              to leave the picture to get back out of it. */}
          <Button
            className="absolute top-3 right-3"
            size="sm"
            variant="outline"
            tone="neutral"
            onClick={() => setResetToken((token) => token + 1)}
          >
            Fit
          </Button>
        </div>
      </div>

      {/*
        Progress and the buy row are ONE bar, stacked with nothing between them.
        They were a screen apart — the bar pinned to the bottom, the progress
        left behind at the end of the scrolling column — which read as two
        unrelated things saying different numbers about the same puzzle.
      */}
      <div className="app-column fixed inset-x-0 bottom-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))] z-20 border-border border-t bg-void/95">
        {/* The album's bar, same size and tones. The count moved *inside* it,
            where an album writes its percentage — pieces rather than percent,
            because that is the unit this screen is priced and bought in. */}
        <div className="flex items-center gap-3 px-4 pt-2">
          <ProgressBar
            className="flex-1"
            tone={done ? "lime" : "cyan"}
            value={(owned.size / total) * 100}
            label={`${owned.size}/${total}`}
            aria-label={`${board.title}: ${owned.size} of ${total} pieces`}
          />

          {/* What you have to spend, the same figure an album detail puts on
              its own buying screen. Here rather than on the row below: at 390px
              that row already carries a price and two buttons, and a 2xl number
              pushes the last of them off the edge. */}
          <span className="flex shrink-0 items-center gap-1 font-numeric text-2xl font-bold text-coin">
            <Coin size="md" />
            {balance.toLocaleString()}
          </span>
        </div>

        {failure && (
          <p role="alert" className="px-4 pt-1 font-body text-2xs text-prio-high-fg">
            {failure}
          </p>
        )}
        {full && (
          <p role="status" className="px-4 pt-1 font-body text-2xs text-ink-dim">
            {MAX_PIECES_PER_UNLOCK} at a time. Buy these and pick some more.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3">
          {done ? (
            <span className="font-body text-sm text-lime">Finished — the picture is whole.</span>
          ) : open ? (
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
              <span className="flex items-center gap-2">
                {/* Offered only when the author priced one. A puzzle without a
                    random price simply has no gamble, the same way an album
                    without one would not. */}
                {board.randomPrice > 0 && picked.size === 0 && (
                  <Button
                    variant="outline"
                    tone="coin"
                    size="sm"
                    disabled={board.randomPrice > balance || pull.isPending}
                    loading={pull.isPending}
                    onClick={gamble}
                  >
                    Random {board.randomPrice}
                  </Button>
                )}
                <Button
                  tone="lime"
                  size="sm"
                  disabled={picked.size === 0 || !affordable || buy.isPending}
                  loading={buy.isPending}
                  onClick={purchase}
                >
                  {picked.size > 0 && !affordable ? "Not enough coins" : "Unlock"}
                </Button>
              </span>
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
      </div>

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
