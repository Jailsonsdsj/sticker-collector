import { IMAGE_SIZES, PIECE_PRESETS, type PiecePreset } from "@sticker-collector/shared";
import { useReducer, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";
import { DiscardDraftDialog } from "../components/DiscardDraftDialog";
import { AppHeader } from "../components/layout";
import { Button, Chip, Coin, Field, Input, Textarea } from "../components/ui";
import { ImagePicker } from "../components/wizard/ImagePicker";
import { imageSrc } from "../lib/imageUpload";
import { useCreatePuzzle } from "../lib/mutations";
import {
  draftGrid,
  initialDraft,
  isPristine,
  isSealable,
  reduce,
  toPayload,
  totalCost,
  validate,
} from "../lib/puzzleDraft";

/**
 * Creating a puzzle.
 *
 * One screen, not a wizard. An album needs four steps because it holds a set of
 * stickers with per-tier prices and odds; a puzzle is one picture, two prices
 * and a count, and spreading six fields across four tabs would be ceremony.
 *
 * Sealed on submit, like an album and for the same reason: `puzzle_frozen`
 * refuses every change to the grid and the prices afterwards. The screen says
 * so before the button, because "there is no edit" is the kind of thing a
 * person should read before rather than discover after.
 */
export function PuzzleNew() {
  const navigate = useNavigate();
  const [draft, dispatch] = useReducer(reduce, initialDraft);
  const [failure, setFailure] = useState<string | null>(null);
  const create = useCreatePuzzle();
  // Sealing navigates too, and must not be asked whether to discard the puzzle
  // it just made. A ref, not state: the blocker reads it at navigation time and
  // a re-render would arrive too late.
  const leaving = useRef(false);

  const grid = draftGrid(draft);
  const problem = validate(draft);

  const blocker = useBlocker(() => !leaving.current && !isPristine(draft));

  async function seal() {
    const payload = toPayload(draft);
    if (!payload || create.isPending) return;

    setFailure(null);
    try {
      const made = await create.mutateAsync(payload);
      leaving.current = true;
      // Straight to the board. It is the thing they just made, and the first
      // question after making one is what it looks like cut up.
      void navigate(`/puzzles/${made.id}`);
    } catch {
      // Stay put: the image is uploaded and the prices are typed, and closing
      // would cost both.
      setFailure("Could not create the puzzle. Try again.");
    }
  }

  return (
    <>
      <AppHeader title="New puzzle" />

      <div className="flex flex-col gap-5">
        <Input
          id="puzzle-title"
          label="Title"
          required
          placeholder="What is the picture?"
          value={draft.title}
          onChange={(e) => dispatch({ kind: "title", value: e.target.value })}
        />
        <Textarea
          id="puzzle-description"
          label="Description"
          rows={3}
          placeholder="Where it is from, why it matters…"
          value={draft.description}
          onChange={(e) => dispatch({ kind: "description", value: e.target.value })}
        />

        <Field label="Picture" hint="square — it is cut into a grid">
          {draft.imageKey ? (
            <div className="flex items-center gap-3">
              {/* Full colour here. The grey cover is what the LIST shows for an
                  unfinished puzzle; this is the author looking at their own
                  picture before they seal it. */}
              <img
                src={imageSrc(draft.imageKey)}
                alt="The picture, uncut"
                width={IMAGE_SIZES.puzzle.width}
                height={IMAGE_SIZES.puzzle.height}
                className="size-24 rounded-xl object-cover"
              />
              <ImagePicker
                kind="puzzle"
                label="Replace"
                onPicked={(imageKey, size) =>
                  dispatch({
                    kind: "image",
                    value: imageKey,
                    width: size.width,
                    height: size.height,
                  })
                }
              />
            </div>
          ) : (
            <ImagePicker
              kind="puzzle"
              label="Choose a picture"
              onPicked={(imageKey, size) =>
                dispatch({
                  kind: "image",
                  value: imageKey,
                  width: size.width,
                  height: size.height,
                })
              }
            />
          )}
        </Field>

        <Field label="Pieces" hint={`cut ${grid.rows} × ${grid.cols}`}>
          <div className="flex flex-wrap gap-2">
            {PIECE_PRESETS.map((count) => (
              <Chip
                key={count}
                tone="violet"
                shape="rounded"
                selected={draft.pieces === count}
                onClick={() => dispatch({ kind: "pieces", value: count as PiecePreset })}
              >
                {count}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="flex gap-3">
          <Input
            id="puzzle-unlock-price"
            type="number"
            tone="numeric"
            label="Unlock price"
            hint="to open it"
            className="flex-1"
            value={draft.unlockPrice}
            onChange={(e) => dispatch({ kind: "unlockPrice", value: e.target.value })}
          />
          <Input
            id="puzzle-piece-price"
            type="number"
            tone="numeric"
            label="Piece price"
            hint="each"
            className="flex-1"
            value={draft.piecePrice}
            onChange={(e) => dispatch({ kind: "piecePrice", value: e.target.value })}
          />
        </div>

        <Input
          id="puzzle-random-price"
          type="number"
          tone="numeric"
          label="Random piece"
          hint="optional — leave empty for no gamble"
          value={draft.randomPrice}
          onChange={(e) => dispatch({ kind: "randomPrice", value: e.target.value })}
        />

        {/* Two small numbers multiply into a large one: 144 pieces at 10 coins
            is a fortnight of tasks. Worth knowing while the prices can still
            be changed. */}
        <p className="flex items-center gap-1 font-body text-sm text-ink-secondary">
          Finishing it costs
          <Coin size="xs" />
          <span className="font-numeric font-bold text-coin">{totalCost(draft)}</span>
          in all.
        </p>

        <Field label="Locked pieces" hint="optional">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.hideLocked}
              onChange={(e) => dispatch({ kind: "hideLocked", value: e.target.checked })}
              className="mt-1 size-5 shrink-0"
            />
            <span className="font-body text-sm text-ink-secondary">
              Hide them completely. Off, a locked piece shows its own part of the picture in black
              and white — on, it shows nothing at all until you buy it.
            </span>
          </label>
        </Field>

        {(problem || failure) && (
          <p role="alert" className="font-body text-sm text-prio-high-fg">
            {failure ?? problem}
          </p>
        )}

        <p className="font-body text-sm text-ink-dim">
          A puzzle is sealed when you make it: the picture, the cut and both prices are fixed from
          then on. You can delete it, but never edit it.
        </p>

        <Button
          tone="lime"
          block
          disabled={!isSealable(draft) || create.isPending}
          loading={create.isPending}
          onClick={seal}
        >
          Create puzzle
        </Button>
      </div>

      <DiscardDraftDialog
        open={blocker.state === "blocked"}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
    </>
  );
}
